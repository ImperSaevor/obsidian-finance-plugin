import type { Account, Transaction, TransactionCalcLink } from '../types';
import { isSumOperator } from './transaction-calc';

export interface TransactionValidationResult {
	valid: boolean;
	errors: string[];
}

export interface ValidateTransactionOptions {
	useCalculated: boolean;
	calcLinks: TransactionCalcLink[];
	accounts: Account[];
	allTransactions: Transaction[];
	currentTxId?: string;
}

export function validateTransaction(
	tx: Partial<Transaction>,
	options: ValidateTransactionOptions,
): TransactionValidationResult {
	const errors: string[] = [];
	const {
		useCalculated,
		calcLinks,
		accounts,
		allTransactions,
		currentTxId,
	} = options;

	if (accounts.length === 0) {
		errors.push('Créez au moins un compte avant d\'enregistrer une transaction.');
	}

	if (!tx.accountId) {
		errors.push('Sélectionnez un compte.');
	}

	if (!tx.date?.trim()) {
		errors.push('Indiquez une date.');
	}

	if (!tx.description?.trim()) {
		errors.push('La description est obligatoire.');
	}

	if (tx.type === 'transfer') {
		if (!tx.transferToAccountId) {
			errors.push('Sélectionnez un compte destination pour le transfert.');
		} else if (tx.transferToAccountId === tx.accountId) {
			errors.push('Le compte destination doit être différent du compte source.');
		}
		if (!useCalculated && !tx.amount) {
			errors.push('Indiquez un montant pour le transfert.');
		}
	} else if (useCalculated) {
		if (calcLinks.length === 0) {
			errors.push('Ajoutez au moins une transaction de référence (bouton « + Lier une transaction »).');
		}

		const validIds = new Set(allTransactions.map(t => t.id));
		for (let i = 0; i < calcLinks.length; i++) {
			const link = calcLinks[i];
			if (isSumOperator(link.operator)) continue;
			if (!link.transactionId) {
				errors.push(`Ligne ${i + 1} du calcul : choisissez une transaction de référence.`);
			} else if (link.transactionId === currentTxId) {
				errors.push('Une transaction ne peut pas se référencer elle-même dans le calcul.');
			} else if (!validIds.has(link.transactionId)) {
				errors.push(`Ligne ${i + 1} : la transaction liée n'existe plus.`);
			}
		}
	} else if (!tx.amount) {
		errors.push('Indiquez un montant, ou activez « Calculer le montant depuis des transactions liées ».');
	}

	return { valid: errors.length === 0, errors };
}

export function renderValidationErrors(container: HTMLElement, errors: string[]): void {
	container.empty();
	container.removeClass('finance-validation-ok');
	if (errors.length === 0) return;

	container.addClass('finance-validation-errors');
	for (const err of errors) {
		container.createEl('div', { text: `• ${err}`, cls: 'finance-validation-item' });
	}
}

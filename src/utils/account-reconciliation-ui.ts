import type { Account, Transaction } from '../types';
import type { FinancePluginSettings } from '../settings';
import { getAccountBalanceReconciliation, getAccountSnapshotCount } from './calculations';
import { formatCurrency } from './format';
import { getLatestAccountSnapshot } from './reconciliation';

export function renderAccountReconciliationBlock(
	parent: HTMLElement,
	account: Account,
	transactions: Transaction[],
	settings: FinancePluginSettings,
	options: { showCalculated?: boolean } = {},
): void {
	const { showCalculated = true } = options;
	const rec = getAccountBalanceReconciliation(account, transactions);
	const block = parent.createDiv({ cls: 'finance-reconcile-block' });

	if (showCalculated) {
		block.createDiv({
			text: `Solde calculé : ${formatCurrency(rec.calculated, account.currency, settings.dateFormat)}`,
			cls: 'finance-reconcile-line',
		});
	}

	if (!rec.hasActual) {
		block.createDiv({
			text: 'Solde réel : non renseigné',
			cls: 'finance-reconcile-line finance-reconcile-muted',
		});
		return;
	}

	block.createDiv({
		text: `Solde réel : ${formatCurrency(rec.actual!, account.currency, settings.dateFormat)}`,
		cls: 'finance-reconcile-line',
	});

	const latest = getLatestAccountSnapshot(account);
	if (latest) {
		block.createDiv({
			text: `Dernier relevé : ${latest.date}${getAccountSnapshotCount(account) > 1 ? ` (+${getAccountSnapshotCount(account) - 1} autre(s))` : ''}`,
			cls: 'finance-reconcile-line finance-reconcile-muted',
		});
	}

	const deltaLine = block.createDiv({
		cls: `finance-reconcile-line finance-reconcile-delta ${rec.isReconciled ? 'finance-reconcile-ok' : 'finance-reconcile-warn'}`,
	});
	if (rec.isReconciled) {
		deltaLine.setText('Écart : aucun');
	} else {
		const sign = rec.delta! > 0 ? '+' : '';
		deltaLine.setText(
			`Écart : ${sign}${formatCurrency(rec.delta!, account.currency, settings.dateFormat)}`,
		);
	}
}

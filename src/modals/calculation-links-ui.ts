import type { CalcOperator, Transaction, TransactionCalcLink, TransactionType } from '../types';
import { computeLinkedAmount, describeCalculation, isSumOperator } from '../utils/transaction-calc';
import { formatCurrency } from '../utils/format';

const OPERATOR_LABELS: Record<CalcOperator, string> = {
	add: 'Addition (+)',
	subtract: 'Soustraction (−)',
	multiply: 'Multiplication (×)',
	percent_of: 'Ajouter % d\'une transaction',
	add_percent_of_sum: 'Ajouter % de la somme',
	subtract_percent_of_sum: 'Soustraire % de la somme',
	multiply_sum: 'Multiplier la somme (×)',
};

const FACTOR_OPERATORS: CalcOperator[] = [
	'multiply',
	'percent_of',
	'add_percent_of_sum',
	'subtract_percent_of_sum',
	'multiply_sum',
];

function defaultFactor(op: CalcOperator): number {
	if (op === 'percent_of' || op === 'add_percent_of_sum' || op === 'subtract_percent_of_sum') return 10;
	if (op === 'multiply_sum') return 1.2;
	return 1;
}

function factorPlaceholder(op: CalcOperator): string {
	if (op === 'percent_of' || op === 'add_percent_of_sum' || op === 'subtract_percent_of_sum') return '%';
	return '×';
}

export function renderCalculationLinksEditor(
	container: HTMLElement,
	transactions: Transaction[],
	links: TransactionCalcLink[],
	useCalculated: boolean,
	currentTxId: string | undefined,
	currency: string,
	locale: string,
	onChange: (links: TransactionCalcLink[], useCalculated: boolean) => void,
	transactionType: TransactionType = 'expense',
): void {
	const section = container.createDiv({ cls: 'finance-calc-section' });
	section.createEl('h3', { text: 'Calcul par liens' });

	let active = useCalculated;
	let currentLinks = [...links];

	const toggleRow = section.createDiv({ cls: 'finance-calc-toggle' });
	const toggle = toggleRow.createEl('input', { type: 'checkbox' });
	toggle.checked = active;
	toggle.addEventListener('change', () => {
		active = toggle.checked;
		if (active && currentLinks.length === 0) {
			const available = transactions.filter(t => t.id !== currentTxId);
			if (available.length > 0) {
				currentLinks = [{
					transactionId: available[0].id,
					operator: 'add',
					useAbsolute: true,
				}];
			}
		}
		onChange(currentLinks, active);
		refresh();
	});
	toggleRow.createSpan({ text: ' Calculer le montant depuis des transactions liées' });

	const editor = section.createDiv({ cls: 'finance-calc-editor' });
	const available = transactions.filter(t => t.id !== currentTxId);

	const renderLinks = () => {
		editor.empty();

		if (available.length === 0 && currentLinks.length === 0) {
			editor.createEl('p', {
				text: 'Aucune autre transaction disponible pour le calcul. Créez d\'abord une transaction de référence.',
				cls: 'finance-modal-hint finance-validation-item',
			});
			return;
		}

		if (currentLinks.length === 0) {
			editor.createEl('p', {
				text: 'Ajoutez au moins une transaction de référence.',
				cls: 'finance-modal-hint',
			});
		}

		currentLinks.forEach((link, index) => {
			const row = editor.createDiv({ cls: 'finance-calc-link-row' });
			const isSumOp = index > 0 && isSumOperator(link.operator);

			if (index > 0) {
				const opSelect = row.createEl('select', { cls: 'finance-calc-op' });
				for (const [op, label] of Object.entries(OPERATOR_LABELS)) {
					opSelect.createEl('option', { text: label, value: op });
				}
				opSelect.value = link.operator;
				opSelect.addEventListener('change', () => {
					link.operator = opSelect.value as CalcOperator;
					if (isSumOperator(link.operator)) {
						link.factor = link.factor ?? defaultFactor(link.operator);
					}
					onChange([...currentLinks], active);
					renderLinks();
				});
			} else {
				row.createSpan({ text: 'Base :', cls: 'finance-calc-op-label' });
			}

			if (!isSumOp) {
				const txSelect = row.createEl('select');
				for (const tx of available) {
					const label = `${tx.description} (${formatCurrency(tx.amount, currency, locale)})`;
					txSelect.createEl('option', { text: label, value: tx.id });
				}
				if (!available.some(t => t.id === link.transactionId)) {
					txSelect.createEl('option', { text: '— Transaction introuvable —', value: '' });
				}
				txSelect.value = link.transactionId || available[0]?.id || '';
				if (!link.transactionId && available[0]) {
					link.transactionId = available[0].id;
				}
				txSelect.addEventListener('change', () => {
					link.transactionId = txSelect.value;
					onChange([...currentLinks], active);
					renderLinks();
				});

				const absWrap = row.createSpan({ cls: 'finance-calc-abs' });
				const absCheck = absWrap.createEl('input', { type: 'checkbox' });
				absCheck.checked = link.useAbsolute ?? false;
				absWrap.createSpan({ text: ' |val.|' });
				absCheck.addEventListener('change', () => {
					link.useAbsolute = absCheck.checked;
					onChange([...currentLinks], active);
					renderLinks();
				});
			} else {
				row.createSpan({ text: 'Somme courante', cls: 'finance-calc-sum-label' });
			}

			if (index > 0 && FACTOR_OPERATORS.includes(link.operator)) {
				const factorInput = row.createEl('input', {
					type: 'text',
					cls: 'finance-calc-factor',
					placeholder: factorPlaceholder(link.operator),
				});
				factorInput.value = String(link.factor ?? defaultFactor(link.operator));
				factorInput.addEventListener('change', () => {
					link.factor = parseFloat(factorInput.value) || undefined;
					onChange([...currentLinks], active);
					renderLinks();
				});
			}

			const removeBtn = row.createEl('button', { text: '✕', cls: 'mod-warning' });
			removeBtn.addEventListener('click', () => {
				currentLinks = currentLinks.filter((_, i) => i !== index);
				onChange([...currentLinks], active);
				renderLinks();
			});
		});

		const addRow = editor.createDiv({ cls: 'finance-calc-add-row' });
		addRow.createEl('button', { text: '+ Lier une transaction' })
			.addEventListener('click', () => {
				const first = available[0];
				if (!first) return;
				currentLinks = [
					...currentLinks,
					{
						transactionId: first.id,
						operator: 'add',
						useAbsolute: true,
					},
				];
				onChange([...currentLinks], active);
				renderLinks();
			});
		addRow.createEl('button', { text: '+ Opération sur la somme' })
			.addEventListener('click', () => {
				const first = available[0];
				currentLinks = [
					...currentLinks,
					{
						transactionId: first?.id ?? '',
						operator: 'add_percent_of_sum',
						factor: 10,
					},
				];
				onChange([...currentLinks], active);
				renderLinks();
			});

		if (currentLinks.length > 0) {
			const amount = computeLinkedAmount(currentLinks, transactions, transactionType);
			const formula = describeCalculation(currentLinks, transactions);
			editor.createEl('p', {
				text: `Formule : ${formula}`,
				cls: 'finance-modal-hint',
			});
			editor.createEl('p', {
				text: `Aperçu : ${formatCurrency(amount, currency, locale)}`,
				cls: 'finance-calc-preview',
			});
		}
	};

	const refresh = () => {
		editor.style.display = active ? '' : 'none';
		if (active) renderLinks();
	};

	refresh();
}

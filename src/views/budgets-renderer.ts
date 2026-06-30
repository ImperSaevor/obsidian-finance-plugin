import type FinancePlugin from '../../main';
import { BudgetModal } from '../modals/budget-modal';
import { getBudgetStatusForMonth } from '../utils/budgets';
import { formatCurrency } from '../utils/format';
import { formatMonthLabel } from '../utils/monthly';

export function renderBudgetsTab(
	el: HTMLElement,
	plugin: FinancePlugin,
	selectedAccountId: string | null,
	onAccountChange: (id: string | null) => void,
	refresh: () => void,
): void {
	const store = plugin.store;
	const settings = plugin.settings;
	const accounts = store.getAccounts();
	const budgets = store.getBudgets();
	const transactions = store.getTransactions();
	const categories = store.getCategories();
	const monthKey = new Date().toISOString().slice(0, 7);

	const toolbar = el.createDiv({ cls: 'finance-toolbar' });
	toolbar.createEl('button', { text: '+ Budget', cls: 'mod-cta' })
		.addEventListener('click', () => {
			new BudgetModal(plugin.app, store, null, selectedAccountId, refresh).open();
		});

	if (accounts.length > 0) {
		const row = el.createDiv({ cls: 'finance-filter-row' });
		row.createSpan({ text: 'Compte : ' });
		const select = row.createEl('select');
		select.createEl('option', { text: 'Tous', value: '' }).selected = !selectedAccountId;
		for (const a of accounts) {
			const opt = select.createEl('option', { text: a.name, value: a.id });
			if (a.id === selectedAccountId) opt.selected = true;
		}
		select.addEventListener('change', () => onAccountChange(select.value || null));
	}

	el.createEl('p', {
		text: `Suivi pour ${formatMonthLabel(monthKey, settings.dateFormat)}`,
		cls: 'finance-modal-hint',
	});

	if (budgets.length === 0) {
		el.createEl('p', { text: 'Aucun budget défini.', cls: 'finance-empty' });
		return;
	}

	const statuses = getBudgetStatusForMonth(budgets, transactions, categories, monthKey, selectedAccountId);
	const grid = el.createDiv({ cls: 'finance-budget-grid' });

	for (const status of statuses) {
		const card = grid.createDiv({ cls: `finance-budget-card ${status.overBudget ? 'over' : ''}` });
		card.createEl('h4', { text: status.categoryName });
		card.createEl('div', {
			text: `${formatCurrency(status.spent, settings.defaultCurrency, settings.dateFormat)} / ${formatCurrency(status.budget.amount, settings.defaultCurrency, settings.dateFormat)}`,
			cls: 'finance-budget-amounts',
		});

		const bar = card.createDiv({ cls: 'finance-budget-bar' });
		const fill = bar.createDiv({ cls: 'finance-budget-fill' });
		fill.style.width = `${Math.min(status.percentage, 100)}%`;
		if (status.overBudget) fill.addClass('over');

		card.createEl('div', {
			text: status.overBudget
				? `Dépassé de ${formatCurrency(Math.abs(status.remaining), settings.defaultCurrency, settings.dateFormat)}`
				: `Reste ${formatCurrency(status.remaining, settings.defaultCurrency, settings.dateFormat)} (${status.percentage.toFixed(0)}%)`,
			cls: 'finance-budget-meta',
		});

		const actions = card.createDiv({ cls: 'finance-card-actions' });
		actions.createEl('button', { text: 'Modifier' })
			.addEventListener('click', () => {
				new BudgetModal(plugin.app, store, status.budget, selectedAccountId, refresh).open();
			});
		actions.createEl('button', { text: '✕', cls: 'mod-warning' })
			.addEventListener('click', async () => {
				await store.deleteBudget(status.budget.id);
				refresh();
			});
	}
}

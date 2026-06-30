import type FinancePlugin from '../../main';
import {
	formatMonthLabel,
	getAccountTransactionsByMonth,
	getSortedMonthKeys,
	summarizeMonthTransactions,
} from '../utils/monthly';
import { createCollapse } from '../utils/collapse';
import { formatCurrency } from '../utils/format';
import {
	applyFiltersAndSort,
	groupTransactions,
	type TransactionFilterState,
} from '../utils/transaction-filters';
import {
	renderFilterSortBar,
	renderTransactionTable,
	type TransactionListContext,
} from './transaction-list-ui';

export function renderMonthlyView(
	el: HTMLElement,
	plugin: FinancePlugin,
	refresh: () => void,
	selectedAccountId: string | null,
	onAccountChange: (id: string | null) => void,
	txFilterState: TransactionFilterState,
	onTxFilterChange: (state: TransactionFilterState) => void,
): void {
	const store = plugin.store;
	const settings = plugin.settings;
	const accounts = store.getAccounts();
	const categories = store.getCategories();
	const transactions = store.getTransactions();

	if (accounts.length === 0) {
		el.createEl('p', { text: 'Créez un compte pour voir la vue mensuelle.', cls: 'finance-empty' });
		return;
	}

	const filterRow = el.createDiv({ cls: 'finance-filter-row' });
	filterRow.createSpan({ text: 'Compte : ' });
	const select = filterRow.createEl('select');
	const showAll = !selectedAccountId;
	select.createEl('option', { text: 'Tous les comptes', value: '' }).selected = showAll;
	for (const a of accounts) {
		const opt = select.createEl('option', { text: a.name, value: a.id });
		if (a.id === selectedAccountId) opt.selected = true;
	}
	select.addEventListener('change', () => onAccountChange(select.value || null));

	const allTags = [...new Set(transactions.flatMap(t => t.tags))].sort();
	renderFilterSortBar(el, txFilterState, categories, allTags, onTxFilterChange);

	const accountList = selectedAccountId
		? accounts.filter(a => a.id === selectedAccountId)
		: accounts;

	const useMonthLayout = txFilterState.groupBy === 'none' || txFilterState.groupBy === 'month';

	for (const account of accountList) {
		const accountTx = transactions.filter(
			t => t.accountId === account.id || t.transferToAccountId === account.id,
		);
		const processed = applyFiltersAndSort(accountTx, txFilterState, categories);

		const ctx: TransactionListContext = {
			plugin,
			accounts,
			categories,
			allTransactions: transactions,
			settings,
			currency: account.currency,
			onRefresh: refresh,
		};

		if (!useMonthLayout) {
			const accountBody = createCollapse(
				el,
				account.name,
				{
					open: accountList.length === 1,
					cls: 'finance-collapse-account',
					badge: `${processed.length} tx`,
				},
			);
			accountBody.parentElement!.style.borderLeftColor = account.color;

			if (processed.length === 0) {
				accountBody.createEl('p', { text: 'Aucune transaction correspondante.', cls: 'finance-empty' });
				continue;
			}

			const groups = groupTransactions(processed, txFilterState.groupBy, categories, settings.dateFormat);
			if (txFilterState.collapseGroups) {
				for (const group of groups) {
					const badge = `${group.transactions.length} · ${formatCurrency(group.total, account.currency, settings.dateFormat)}`;
					const body = createCollapse(accountBody, group.label, {
						open: groups.indexOf(group) === 0,
						cls: 'finance-collapse-nested',
						badge,
					});
					renderTransactionTable(body, group.transactions, ctx);
				}
			} else {
				for (const group of groups) {
					const header = accountBody.createDiv({ cls: 'finance-group-header' });
					header.createEl('h4', { text: group.label });
					header.createSpan({
						text: `${group.transactions.length} · ${formatCurrency(group.total, account.currency, settings.dateFormat)}`,
						cls: 'finance-collapse-badge',
					});
					renderTransactionTable(accountBody, group.transactions, ctx);
				}
			}
			continue;
		}

		const byMonth = getAccountTransactionsByMonth(account.id, processed);
		const monthKeys = getSortedMonthKeys(byMonth);

		const accountBody = createCollapse(
			el,
			account.name,
			{
				open: accountList.length === 1,
				cls: 'finance-collapse-account',
				badge: `${monthKeys.length} mois`,
			},
		);
		accountBody.parentElement!.style.borderLeftColor = account.color;

		if (monthKeys.length === 0) {
			accountBody.createEl('p', { text: 'Aucune transaction pour ce compte.', cls: 'finance-empty' });
			continue;
		}

		for (const monthKey of monthKeys) {
			const monthTx = byMonth.get(monthKey)!;
			const summary = summarizeMonthTransactions(monthTx);
			const monthLabel = formatMonthLabel(monthKey, settings.dateFormat);
			const badge = `${formatCurrency(summary.net, account.currency, settings.dateFormat)} · ${summary.count} tx`;

			const monthBody = createCollapse(
				accountBody,
				monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
				{ open: monthKey === monthKeys[0], cls: 'finance-collapse-nested', badge },
			);

			const stats = monthBody.createDiv({ cls: 'finance-month-stats' });
			stats.createDiv({
				text: `Revenus : ${formatCurrency(summary.income, account.currency, settings.dateFormat)}`,
				cls: 'positive',
			});
			stats.createDiv({
				text: `Dépenses : ${formatCurrency(summary.expenses, account.currency, settings.dateFormat)}`,
				cls: 'negative',
			});
			stats.createDiv({
				text: `Solde du mois : ${formatCurrency(summary.net, account.currency, settings.dateFormat)}`,
				cls: `finance-month-net ${summary.net >= 0 ? 'positive' : 'negative'}`,
			});

			if (txFilterState.groupBy === 'month' && txFilterState.collapseGroups) {
				const subGroups = groupTransactions(monthTx, 'category', categories, settings.dateFormat);
				for (const group of subGroups) {
					const subBadge = `${group.transactions.length} · ${formatCurrency(group.total, account.currency, settings.dateFormat)}`;
					const subBody = createCollapse(monthBody, group.label, {
						open: false,
						cls: 'finance-collapse-nested',
						badge: subBadge,
					});
					renderTransactionTable(subBody, group.transactions, ctx);
				}
			} else {
				renderTransactionTable(monthBody, monthTx, ctx);
			}
		}
	}
}

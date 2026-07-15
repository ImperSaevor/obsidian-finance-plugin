import type FinancePlugin from '../../main';
import { AccountModal } from '../modals/account-modal';
import { assignDistinctColors, drawBarChart, drawPieChart } from '../charts/chart-utils';
import {
	getAccountBalance,
	getCategoryBreakdown,
	getProjectedBalance,
	countUnreconciledAccounts,
	getAccountBalanceReconciliation,
} from '../utils/calculations';
import { renderAccountReconciliationBlock } from '../utils/account-reconciliation-ui';
import { getCategoriesForAccount, getChildCategories, getRootCategories } from '../utils/categories';
import { createCollapse } from '../utils/collapse';
import { formatCurrency } from '../utils/format';
import type { TransactionFilterState } from '../utils/transaction-filters';
import { applyFiltersAndSort, hasActiveFilters } from '../utils/transaction-filters';
import {
	renderCompactTransactionList,
	renderFilteredTransactionList,
	renderFilterResultsMeta,
	renderFilterSortBar,
	type TransactionListContext,
} from './transaction-list-ui';

export function renderOverview(
	el: HTMLElement,
	plugin: FinancePlugin,
	refresh: () => void,
	selectedAccountId: string | null,
	onAccountChange: (id: string | null) => void,
	txFilterState: TransactionFilterState,
	onTxFilterChange: (state: TransactionFilterState) => void,
	onOpenReconciliation?: (accountId: string) => void,
): void {
	const store = plugin.store;
	const settings = plugin.settings;
	const accounts = store.getAccounts();
	const transactions = store.getTransactions();
	const categories = store.getCategories();
	const forecasts = store.getForecasts();

	const toolbar = el.createDiv({ cls: 'finance-toolbar' });
	toolbar.createEl('button', { text: '+ Nouveau compte', cls: 'mod-cta' })
		.addEventListener('click', () => {
			new AccountModal(plugin.app, store, settings, null, refresh).open();
		});

	if (accounts.length === 0) {
		el.createEl('p', { text: 'Aucun compte. Créez votre premier compte pour commencer.', cls: 'finance-empty' });
		return;
	}

	const filterRow = el.createDiv({ cls: 'finance-filter-row' });
	filterRow.createSpan({ text: 'Compte : ' });
	const select = filterRow.createEl('select');
	select.createEl('option', { text: 'Tous les comptes', value: '' }).selected = !selectedAccountId;
	for (const a of accounts) {
		const opt = select.createEl('option', { text: a.name, value: a.id });
		if (a.id === selectedAccountId) opt.selected = true;
	}
	select.addEventListener('change', () => onAccountChange(select.value || null));

	const visibleAccounts = selectedAccountId
		? accounts.filter(a => a.id === selectedAccountId)
		: accounts;
	const scopedTransactions = selectedAccountId
		? transactions.filter(
			t => t.accountId === selectedAccountId || t.transferToAccountId === selectedAccountId,
		)
		: transactions;

	const totalBalance = visibleAccounts.reduce(
		(sum, a) => sum + getAccountBalance(a.id, transactions, a.initialBalance),
		0,
	);
	const summaryCurrency = selectedAccountId
		? visibleAccounts[0]?.currency ?? settings.defaultCurrency
		: settings.defaultCurrency;
	const summaryTitle = selectedAccountId
		? `Synthèse — ${visibleAccounts[0]?.name ?? 'Compte'}`
		: 'Synthèse globale';

	// Synthèse
	const summaryBody = createCollapse(
		el,
		summaryTitle,
		{ open: true, badge: formatCurrency(totalBalance, summaryCurrency, settings.dateFormat) },
	);

	const summaryGrid = summaryBody.createDiv({ cls: 'finance-overview-stats' });
	const unreconciledCount = countUnreconciledAccounts(visibleAccounts, transactions);
	for (const account of visibleAccounts) {
		const rec = getAccountBalanceReconciliation(account, transactions);
		const stat = summaryGrid.createDiv({ cls: 'finance-overview-stat' });
		stat.style.borderLeftColor = account.color;
		stat.createEl('div', { text: account.name, cls: 'finance-overview-stat-label' });
		stat.createEl('div', {
			text: formatCurrency(rec.calculated, account.currency, settings.dateFormat),
			cls: `finance-overview-stat-value ${rec.calculated >= 0 ? 'positive' : 'negative'}`,
		});
		if (rec.hasActual) {
			const sub = stat.createDiv({ cls: 'finance-overview-stat-sub' });
			sub.createDiv({
				text: `Réel : ${formatCurrency(rec.actual!, account.currency, settings.dateFormat)}`,
			});
			const deltaEl = sub.createDiv({
				cls: rec.isReconciled ? 'finance-reconcile-ok' : 'finance-reconcile-warn',
			});
			if (rec.isReconciled) {
				deltaEl.setText('Écart : aucun');
			} else {
				const sign = rec.delta! > 0 ? '+' : '';
				deltaEl.setText(`Écart : ${sign}${formatCurrency(rec.delta!, account.currency, settings.dateFormat)}`);
			}
		}
	}

	if (visibleAccounts.some(a => a.actualBalance !== undefined)) {
		const reconcileSummary = summaryBody.createDiv({ cls: 'finance-reconcile-summary' });
		if (unreconciledCount === 0) {
			reconcileSummary.createDiv({
				text: 'Réconciliation : tous les comptes renseignés correspondent au calcul.',
				cls: 'finance-reconcile-ok',
			});
		} else {
			reconcileSummary.createDiv({
				text: `Réconciliation : ${unreconciledCount} compte(s) avec un écart.`,
				cls: 'finance-reconcile-warn',
			});
		}
	}

	const overviewCanvas = summaryBody.createEl('canvas', { cls: 'finance-chart finance-overview-chart' });
	const balances = visibleAccounts.map(a => getAccountBalance(a.id, transactions, a.initialBalance));
	requestAnimationFrame(() => {
		drawBarChart(overviewCanvas, visibleAccounts.map(a => a.name), balances, visibleAccounts.map(a => a.color));
	});

	// Détail compte(s)
	const detailTitle = selectedAccountId ? 'Détail du compte' : 'Détail par compte';
	const accountsBody = createCollapse(el, detailTitle, { open: true });

	const allTags = [...new Set(scopedTransactions.flatMap(t => t.tags))].sort();
	renderFilterSortBar(accountsBody, txFilterState, categories, allTags, onTxFilterChange);

	const processedAll = applyFiltersAndSort(scopedTransactions, txFilterState, categories);
	renderFilterResultsMeta(accountsBody, processedAll.length, scopedTransactions.length, txFilterState, onTxFilterChange);

	if (scopedTransactions.length > 0) {
		const txCollapse = createCollapse(
			accountsBody,
			'Transactions',
			{ open: !hasActiveFilters(txFilterState), badge: String(processedAll.length) },
		);

		if (processedAll.length > 0) {
			const ctx: TransactionListContext = {
				plugin,
				accounts,
				categories,
				allTransactions: transactions,
				settings,
				currency: summaryCurrency,
				compact: true,
				onRefresh: refresh,
			};
			renderCompactTransactionList(
				txCollapse,
				scopedTransactions,
				txFilterState,
				ctx,
				onTxFilterChange,
				{ showFilterBar: false, showAccountName: !selectedAccountId, collapseByDefault: true },
			);
		} else {
			txCollapse.createEl('p', {
				text: 'Aucune transaction ne correspond aux filtres.',
				cls: 'finance-empty',
			});
		}
	}

	for (const account of visibleAccounts) {
		const balance = getAccountBalance(account.id, transactions, account.initialBalance);
		const rec = getAccountBalanceReconciliation(account, transactions);
		const accountCategories = getCategoriesForAccount(categories, account.id);
		const breakdown = getCategoryBreakdown(account.id, transactions, accountCategories);
		const accountTx = transactions.filter(
			t => t.accountId === account.id || t.transferToAccountId === account.id,
		);

		const toDate = new Date();
		toDate.setFullYear(toDate.getFullYear() + 1);
		const projected = getProjectedBalance(account, transactions, forecasts, toDate.toISOString().slice(0, 10));

		const accountBody = selectedAccountId
			? accountsBody
			: createCollapse(
				accountsBody,
				account.name,
				{
					open: !hasActiveFilters(txFilterState),
					cls: 'finance-collapse-nested',
					badge: rec.hasActual && !rec.isReconciled
						? `${formatCurrency(balance, account.currency, settings.dateFormat)} · écart`
						: formatCurrency(balance, account.currency, settings.dateFormat),
				},
			);
		if (!selectedAccountId) {
			accountBody.parentElement!.style.borderLeftColor = account.color;
		} else if (accountBody === accountsBody) {
			accountsBody.style.borderLeftColor = account.color;
			accountsBody.style.borderLeftWidth = '3px';
			accountsBody.style.borderLeftStyle = 'solid';
			accountsBody.style.paddingLeft = '12px';
		}

		const metrics = accountBody.createDiv({ cls: 'finance-overview-metrics' });
		renderAccountReconciliationBlock(metrics, account, transactions, settings);
		metrics.createDiv({ text: `Prévision 12 mois : ${formatCurrency(projected, account.currency, settings.dateFormat)}` });
		metrics.createDiv({ text: `${accountCategories.length} catégorie(s) liée(s)` });

		if (breakdown.length > 0) {
			const catBody = createCollapse(accountBody, 'Répartition des dépenses', { open: true, cls: 'finance-collapse-nested' });
			const chartRow = catBody.createDiv({ cls: 'finance-chart-row' });
			const pieCanvas = chartRow.createEl('canvas', { cls: 'finance-chart finance-pie-chart finance-chart-sm' });
			const pieColors = assignDistinctColors(breakdown.map(b => b.color));
			const pieTotal = breakdown.reduce((s, b) => s + b.total, 0);
			requestAnimationFrame(() => drawPieChart(pieCanvas, breakdown, {
				colors: pieColors,
				centerLabel: formatCurrency(pieTotal, account.currency, settings.dateFormat),
				centerSubLabel: 'Total dépenses',
			}));

			const legend = chartRow.createDiv({ cls: 'finance-legend' });
			for (let i = 0; i < breakdown.length; i++) {
				const item = breakdown[i];
				const legendItem = legend.createDiv({ cls: 'finance-legend-item' });
				legendItem.createSpan({ cls: 'finance-legend-color' }).style.backgroundColor = pieColors[i];
				const label = legendItem.createDiv({ cls: 'finance-legend-label' });
				label.createSpan({ text: item.categoryName, cls: 'finance-legend-name' });
				label.createSpan({
					text: `${formatCurrency(item.total, account.currency, settings.dateFormat)} · ${item.percentage.toFixed(1)}%`,
					cls: 'finance-legend-value',
				});
			}
		}

		const accountRoots = getRootCategories(categories, account.id);
		if (accountRoots.length > 0) {
			const treeBody = createCollapse(accountBody, 'Catégories du compte', { open: false, cls: 'finance-collapse-nested' });
			for (const root of accountRoots) {
				const rootLine = treeBody.createDiv({ cls: 'finance-overview-cat-line' });
				rootLine.createSpan({ cls: 'finance-legend-color' }).style.backgroundColor = root.color;
				const scope = root.accountId ? ' (compte)' : ' (global)';
				rootLine.createSpan({ text: root.name + scope });
				for (const child of getChildCategories(root.id, categories, account.id)) {
					const childLine = treeBody.createDiv({ cls: 'finance-overview-cat-line finance-overview-cat-child' });
					childLine.createSpan({ cls: 'finance-legend-color' }).style.backgroundColor = child.color;
					childLine.createSpan({ text: `└ ${child.name}` });
				}
			}
		}

		if (accountTx.length > 0) {
			const processedCount = applyFiltersAndSort(accountTx, txFilterState, categories).length;
			const txBody = createCollapse(
				accountBody,
				'Transactions du compte',
				{ open: false, cls: 'finance-collapse-nested', badge: String(processedCount) },
			);

			const ctx: TransactionListContext = {
				plugin,
				accounts,
				categories,
				allTransactions: transactions,
				settings,
				currency: account.currency,
				compact: true,
				onRefresh: refresh,
			};

			renderCompactTransactionList(
				txBody,
				accountTx,
				txFilterState,
				ctx,
				onTxFilterChange,
				{ showFilterBar: false, filterCategories: accountCategories, collapseByDefault: true },
			);
		}

		const actions = accountBody.createDiv({ cls: 'finance-card-actions' });
		actions.createEl('button', { text: 'Modifier le compte' })
			.addEventListener('click', () => {
				new AccountModal(
					plugin.app,
					store,
					settings,
					account,
					refresh,
					onOpenReconciliation,
				).open();
			});
		if (onOpenReconciliation) {
			actions.createEl('button', { text: 'Réconciliation' })
				.addEventListener('click', () => onOpenReconciliation(account.id));
		}
	}

	// Transactions récentes
	if (scopedTransactions.length > 0) {
		const recentTitle = selectedAccountId ? 'Transactions du compte' : 'Toutes les transactions';
		const recentBody = createCollapse(el, recentTitle, { open: false });
		const ctx: TransactionListContext = {
			plugin,
			accounts,
			categories,
			allTransactions: transactions,
			settings,
			currency: summaryCurrency,
			showAccountColumn: !selectedAccountId,
			onRefresh: refresh,
		};
		renderFilteredTransactionList(
			recentBody,
			scopedTransactions,
			txFilterState,
			ctx,
			onTxFilterChange,
			{ showFilterBar: false },
		);
	}
}

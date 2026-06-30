import type FinancePlugin from '../../main';
import { AccountModal } from '../modals/account-modal';
import { assignDistinctColors, drawBarChart, drawPieChart } from '../charts/chart-utils';
import {
	getAccountBalance,
	getCategoryBreakdown,
	getProjectedBalance,
} from '../utils/calculations';
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
	txFilterState: TransactionFilterState,
	onTxFilterChange: (state: TransactionFilterState) => void,
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

	const totalBalance = accounts.reduce(
		(sum, a) => sum + getAccountBalance(a.id, transactions, a.initialBalance),
		0,
	);

	// Synthèse globale
	const summaryBody = createCollapse(
		el,
		'Synthèse globale',
		{ open: true, badge: formatCurrency(totalBalance, settings.defaultCurrency, settings.dateFormat) },
	);

	const summaryGrid = summaryBody.createDiv({ cls: 'finance-overview-stats' });
	for (const account of accounts) {
		const balance = getAccountBalance(account.id, transactions, account.initialBalance);
		const stat = summaryGrid.createDiv({ cls: 'finance-overview-stat' });
		stat.style.borderLeftColor = account.color;
		stat.createEl('div', { text: account.name, cls: 'finance-overview-stat-label' });
		stat.createEl('div', {
			text: formatCurrency(balance, account.currency, settings.dateFormat),
			cls: `finance-overview-stat-value ${balance >= 0 ? 'positive' : 'negative'}`,
		});
	}

	const overviewCanvas = summaryBody.createEl('canvas', { cls: 'finance-chart finance-overview-chart' });
	const balances = accounts.map(a => getAccountBalance(a.id, transactions, a.initialBalance));
	requestAnimationFrame(() => {
		drawBarChart(overviewCanvas, accounts.map(a => a.name), balances, accounts.map(a => a.color));
	});

	// Par compte
	const accountsBody = createCollapse(el, 'Détail par compte', { open: true });

	const allTags = [...new Set(transactions.flatMap(t => t.tags))].sort();
	renderFilterSortBar(accountsBody, txFilterState, categories, allTags, onTxFilterChange);

	const processedAll = applyFiltersAndSort(transactions, txFilterState, categories);
	renderFilterResultsMeta(accountsBody, processedAll.length, transactions.length, txFilterState, onTxFilterChange);

	if (transactions.length > 0) {
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
				currency: settings.defaultCurrency,
				compact: true,
				onRefresh: refresh,
			};
			renderCompactTransactionList(
				txCollapse,
				transactions,
				txFilterState,
				ctx,
				onTxFilterChange,
				{ showFilterBar: false, showAccountName: true, collapseByDefault: true },
			);
		} else {
			txCollapse.createEl('p', {
				text: 'Aucune transaction ne correspond aux filtres.',
				cls: 'finance-empty',
			});
		}
	}

	for (const account of accounts) {
		const balance = getAccountBalance(account.id, transactions, account.initialBalance);
		const accountCategories = getCategoriesForAccount(categories, account.id);
		const breakdown = getCategoryBreakdown(account.id, transactions, accountCategories);
		const accountTx = transactions.filter(
			t => t.accountId === account.id || t.transferToAccountId === account.id,
		);

		const toDate = new Date();
		toDate.setFullYear(toDate.getFullYear() + 1);
		const projected = getProjectedBalance(account, transactions, forecasts, toDate.toISOString().slice(0, 10));

		const accountBody = createCollapse(
			accountsBody,
			account.name,
			{
				open: !hasActiveFilters(txFilterState),
				cls: 'finance-collapse-nested',
				badge: formatCurrency(balance, account.currency, settings.dateFormat),
			},
		);
		accountBody.parentElement!.style.borderLeftColor = account.color;

		const metrics = accountBody.createDiv({ cls: 'finance-overview-metrics' });
		metrics.createDiv({ text: `Solde actuel : ${formatCurrency(balance, account.currency, settings.dateFormat)}` });
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
				new AccountModal(plugin.app, store, settings, account, refresh).open();
			});
	}

	// Transactions récentes globales
	if (transactions.length > 0) {
		const recentBody = createCollapse(el, 'Toutes les transactions', { open: false });
		const ctx: TransactionListContext = {
			plugin,
			accounts,
			categories,
			allTransactions: transactions,
			settings,
			currency: settings.defaultCurrency,
			showAccountColumn: true,
			onRefresh: refresh,
		};
		renderFilteredTransactionList(
			recentBody,
			transactions,
			txFilterState,
			ctx,
			onTxFilterChange,
			{ showFilterBar: false },
		);
	}
}

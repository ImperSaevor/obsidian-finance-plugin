import type FinancePlugin from '../../main';
import { assignDistinctColors, drawBarChart, drawFlowChart, drawLineChart, drawPieChart } from '../charts/chart-utils';
import {
	getAccountBalance,
	getBalanceHistory,
	getCategoryBreakdown,
	getMonthlyIncomeExpense,
} from '../utils/calculations';
import { getCategoriesForAccount, getChildCategories, getRootCategories } from '../utils/categories';
import { bindPieLegend, bindResponsiveChart } from '../utils/chart-bind';
import { formatCurrency } from '../utils/format';

export function renderChartsTab(
	el: HTMLElement,
	plugin: FinancePlugin,
	selectedAccountId: string | null,
	onAccountChange: (id: string) => void,
): void {
	const store = plugin.store;
	const settings = plugin.settings;
	const accounts = store.getAccounts();
	const transactions = store.getTransactions();
	const categories = store.getCategories();

	if (accounts.length === 0) {
		el.createEl('p', { text: 'Créez un compte pour voir les graphiques.', cls: 'finance-empty' });
		return;
	}

	const selector = el.createDiv({ cls: 'finance-filter-row' });
	selector.createSpan({ text: 'Compte : ' });
	const select = selector.createEl('select');
	const accountId = selectedAccountId ?? accounts[0].id;
	for (const a of accounts) {
		const opt = select.createEl('option', { text: a.name, value: a.id });
		if (a.id === accountId) opt.selected = true;
	}
	select.addEventListener('change', () => onAccountChange(select.value));

	const account = accounts.find(a => a.id === accountId)!;
	const accountCategories = getCategoriesForAccount(categories, accountId);

	const balanceSection = el.createDiv({ cls: 'finance-chart-section' });
	balanceSection.createEl('h3', { text: `Évolution du solde — ${account.name}` });
	const balanceCanvas = balanceSection.createEl('canvas', { cls: 'finance-chart' });
	const history = getBalanceHistory(account.id, transactions, account.initialBalance);
	if (history.length > 0) {
		const draw = () => drawLineChart(
			balanceCanvas,
			history.map(p => p.date),
			history.map(p => p.balance),
			account.color,
		);
		bindResponsiveChart(balanceCanvas, draw);
	} else {
		balanceSection.createEl('p', { text: 'Pas assez de données pour le graphique.', cls: 'finance-empty' });
	}

	const flowSection = el.createDiv({ cls: 'finance-chart-section' });
	flowSection.createEl('h3', { text: 'Revenus vs dépenses par mois' });
	const flowCanvas = flowSection.createEl('canvas', { cls: 'finance-chart' });
	const flow = getMonthlyIncomeExpense(account.id, transactions);
	if (flow.length > 0) {
		const draw = () => drawFlowChart(
			flowCanvas,
			flow.map(f => f.month),
			flow.map(f => f.income),
			flow.map(f => f.expense),
		);
		bindResponsiveChart(flowCanvas, draw);
	} else {
		flowSection.createEl('p', { text: 'Pas de flux mensuel à afficher.', cls: 'finance-empty' });
	}

	renderPieSection(el, 'Répartition des dépenses', getCategoryBreakdown(account.id, transactions, accountCategories, 'expense'), account, settings);
	renderPieSection(el, 'Répartition des revenus', getCategoryBreakdown(account.id, transactions, accountCategories, 'income'), account, settings);

	const divisionSection = el.createDiv({ cls: 'finance-chart-section' });
	divisionSection.createEl('h3', { text: 'Divisions de catégories' });
	const rootCategories = getRootCategories(accountCategories, accountId);

	if (rootCategories.length === 0) {
		divisionSection.createEl('p', { text: 'Créez des catégories avec des sous-catégories pour voir les divisions.', cls: 'finance-empty' });
	} else {
		for (const root of rootCategories) {
			const children = getChildCategories(root.id, categories, accountId);
			if (children.length === 0) continue;

			const divBlock = divisionSection.createDiv({ cls: 'finance-division-block' });
			divBlock.createEl('h4', { text: root.name });

			const childBreakdown = children.map(child => {
				const childTx = transactions.filter(
					t => t.accountId === accountId && t.categoryId === child.id && t.amount < 0,
				);
				const total = childTx.reduce((s, t) => s + Math.abs(t.amount), 0);
				return { name: child.name, total, color: child.color };
			}).filter(c => c.total > 0);

			if (childBreakdown.length > 0) {
				const barCanvas = divBlock.createEl('canvas', { cls: 'finance-chart' });
				const draw = () => drawBarChart(
					barCanvas,
					childBreakdown.map(c => c.name),
					childBreakdown.map(c => c.total),
					childBreakdown.map(c => c.color),
				);
				bindResponsiveChart(barCanvas, draw);

				const list = divBlock.createDiv({ cls: 'finance-division-list' });
				const parentTotal = childBreakdown.reduce((s, c) => s + c.total, 0);
				for (const child of childBreakdown) {
					const pct = (child.total / parentTotal) * 100;
					list.createDiv({
						text: `${child.name} : ${formatCurrency(child.total, account.currency, settings.dateFormat)} (${pct.toFixed(1)}%)`,
						cls: 'finance-division-item',
					});
				}
			}
		}
	}

	const overviewSection = el.createDiv({ cls: 'finance-chart-section' });
	overviewSection.createEl('h3', { text: 'Vue d\'ensemble des comptes' });
	const overviewCanvas = overviewSection.createEl('canvas', { cls: 'finance-chart' });
	const balances = accounts.map(a => getAccountBalance(a.id, transactions, a.initialBalance));
	const drawOverview = () => drawBarChart(
		overviewCanvas,
		accounts.map(a => a.name),
		balances,
		accounts.map(a => a.color),
	);
	bindResponsiveChart(overviewCanvas, drawOverview);
}

function renderPieSection(
	parent: HTMLElement,
	title: string,
	breakdown: ReturnType<typeof getCategoryBreakdown>,
	account: { currency: string },
	settings: { dateFormat: string },
): void {
	const section = parent.createDiv({ cls: 'finance-chart-section' });
	section.createEl('h3', { text: title });

	if (breakdown.length === 0) {
		section.createEl('p', { text: 'Aucune donnée.', cls: 'finance-empty' });
		return;
	}

	const chartRow = section.createDiv({ cls: 'finance-chart-row' });
	const pieCanvas = chartRow.createEl('canvas', { cls: 'finance-chart finance-pie-chart' });
	const pieColors = assignDistinctColors(breakdown.map(b => b.color));
	const pieTotal = breakdown.reduce((s, b) => s + b.total, 0);
	const legendItems: HTMLElement[] = [];

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
		legendItems.push(legendItem);
	}

	const highlightController = { setHighlight: (_index: number | null) => {} };
	const draw = () => drawPieChart(pieCanvas, breakdown, {
		colors: pieColors,
		centerLabel: formatCurrency(pieTotal, account.currency, settings.dateFormat),
		centerSubLabel: title.includes('revenus') ? 'Total revenus' : 'Total dépenses',
		highlightController,
	});
	bindResponsiveChart(pieCanvas, draw);
	bindPieLegend(legendItems, idx => highlightController.setHighlight(idx));
}

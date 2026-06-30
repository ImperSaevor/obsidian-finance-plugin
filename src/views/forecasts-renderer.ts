import type FinancePlugin from '../../main';
import { ForecastModal } from '../modals/forecast-modal';
import {
	getAccountBalance,
	getForecastOccurrences,
	getProjectedBalance,
} from '../utils/calculations';
import { createActionBar, renderActionButton } from '../utils/action-buttons';
import { confirmAction } from '../utils/confirm';
import { createCollapse } from '../utils/collapse';
import { formatCurrency, formatDate } from '../utils/format';
import type { Forecast } from '../types';

const FREQUENCY_LABELS: Record<string, string> = {
	once: 'Une fois',
	weekly: 'Hebdomadaire',
	monthly: 'Mensuelle',
	yearly: 'Annuelle',
};

function renderForecastRow(
	row: HTMLElement,
	forecast: Forecast,
	plugin: FinancePlugin,
	refresh: () => void,
): void {
	const store = plugin.store;
	const settings = plugin.settings;
	const accounts = store.getAccounts();
	const account = accounts.find(a => a.id === forecast.accountId);

	row.createEl('td', { cls: 'finance-desc-col', text: forecast.description });
	row.createEl('td', { text: account?.name ?? '—', cls: account ? '' : 'finance-cell-empty' });
	row.createEl('td', {
		text: formatCurrency(forecast.amount, account?.currency ?? settings.defaultCurrency, settings.dateFormat),
		cls: `finance-amount-col ${forecast.amount >= 0 ? 'positive' : 'negative'}`,
	});
	row.createEl('td', { text: FREQUENCY_LABELS[forecast.frequency] ?? forecast.frequency });
	row.createEl('td', { cls: 'finance-date-col', text: formatDate(forecast.startDate, settings.dateFormat) });
	const endText = forecast.endDate ? formatDate(forecast.endDate, settings.dateFormat) : '—';
	row.createEl('td', { text: endText, cls: forecast.endDate ? 'finance-date-col' : 'finance-cell-empty' });

	const actionsTd = row.createEl('td', { cls: 'finance-row-actions' });
	const bar = createActionBar(actionsTd);

	renderActionButton(bar, '✎', 'Modifier', () => {
		new ForecastModal(plugin.app, store, forecast, null, refresh).open();
	});
	renderActionButton(bar, '✕', 'Supprimer', () => {
		void (async () => {
			if (await confirmAction(plugin.app, 'Supprimer', `Supprimer la prévision « ${forecast.description} » ?`)) {
				await store.deleteForecast(forecast.id);
				refresh();
			}
		})();
	}, { warning: true });
}

export function renderForecastsTab(
	el: HTMLElement,
	plugin: FinancePlugin,
	refresh: () => void,
	selectedAccountId: string | null,
	onAccountChange: (id: string | null) => void,
): void {
	const store = plugin.store;
	const settings = plugin.settings;
	const accounts = store.getAccounts();
	let forecasts = store.getForecasts();

	const toolbar = el.createDiv({ cls: 'finance-toolbar' });
	toolbar.createEl('button', { text: '+ Prévision', cls: 'mod-cta' })
		.addEventListener('click', () => {
			new ForecastModal(
				plugin.app,
				store,
				null,
				selectedAccountId ?? accounts[0]?.id ?? null,
				refresh,
			).open();
		});

	if (accounts.length > 0) {
		const filterRow = el.createDiv({ cls: 'finance-filter-row' });
		filterRow.createSpan({ text: 'Compte : ' });
		const select = filterRow.createEl('select');
		select.createEl('option', { text: 'Tous', value: '' }).selected = !selectedAccountId;
		for (const a of accounts) {
			const opt = select.createEl('option', { text: a.name, value: a.id });
			if (a.id === selectedAccountId) opt.selected = true;
		}
		select.addEventListener('change', () => onAccountChange(select.value || null));
	}

	const projectionBody = createCollapse(el, 'Projections (12 mois)', {
		open: true,
		badge: String(accounts.length),
	});
	const projGrid = projectionBody.createDiv({ cls: 'finance-accounts-grid' });
	const toDate = new Date();
	toDate.setFullYear(toDate.getFullYear() + 1);
	const toDateStr = toDate.toISOString().slice(0, 10);
	const accountList = selectedAccountId
		? accounts.filter(a => a.id === selectedAccountId)
		: accounts;

	for (const account of accountList) {
		const projected = getProjectedBalance(account, store.getTransactions(), forecasts, toDateStr);
		const current = getAccountBalance(account.id, store.getTransactions(), account.initialBalance);
		const card = projGrid.createDiv({ cls: 'finance-account-card' });
		card.style.borderLeftColor = account.color;
		card.createEl('h4', { text: account.name });
		card.createEl('div', {
			text: `Actuel : ${formatCurrency(current, account.currency, settings.dateFormat)}`,
			cls: 'finance-proj-current',
		});
		card.createEl('div', {
			text: `Prévu : ${formatCurrency(projected, account.currency, settings.dateFormat)}`,
			cls: `finance-balance ${projected >= 0 ? 'positive' : 'negative'}`,
		});
	}

	if (selectedAccountId) {
		forecasts = forecasts.filter(f => f.accountId === selectedAccountId);
	}

	const listSection = el.createDiv({ cls: 'finance-transactions-main' });
	const meta = listSection.createDiv({ cls: 'finance-filter-meta' });
	meta.createSpan({ text: `${forecasts.length} prévision(s)` });

	if (forecasts.length === 0) {
		listSection.createEl('p', { text: 'Aucune prévision définie.', cls: 'finance-empty' });
	} else {
		const wrap = listSection.createDiv({ cls: 'finance-table-wrap' });
		const table = wrap.createEl('table', { cls: 'finance-table' });
		const headRow = table.createEl('thead').createEl('tr');
		for (const [col, cls] of [
			['Description', ''],
			['Compte', ''],
			['Montant', 'finance-amount-col'],
			['Fréquence', ''],
			['Début', ''],
			['Fin', ''],
			['Actions', 'finance-actions-col'],
		] as const) {
			const th = headRow.createEl('th', { text: col });
			if (cls) th.addClass(cls);
		}

		const tbody = table.createEl('tbody');
		for (const f of forecasts) {
			renderForecastRow(tbody.createEl('tr'), f, plugin, refresh);
		}
	}

	const today = new Date().toISOString().slice(0, 10);
	const future = new Date();
	future.setMonth(future.getMonth() + 3);
	const scopeForecasts = selectedAccountId
		? store.getForecasts().filter(f => f.accountId === selectedAccountId)
		: store.getForecasts();
	const occurrences = getForecastOccurrences(scopeForecasts, today, future.toISOString().slice(0, 10));

	if (occurrences.length > 0) {
		const occBody = createCollapse(
			el,
			'Échéances à venir (3 mois)',
			{ open: true, badge: String(occurrences.length) },
		);
		const wrap = occBody.createDiv({ cls: 'finance-table-wrap' });
		const table = wrap.createEl('table', { cls: 'finance-table' });
		const headRow = table.createEl('thead').createEl('tr');
		for (const [col, cls] of [
			['Date', 'finance-date-col'],
			['Description', ''],
			['Montant', 'finance-amount-col'],
		] as const) {
			const th = headRow.createEl('th', { text: col });
			if (cls) th.addClass(cls);
		}

		const tbody = table.createEl('tbody');
		for (const occ of occurrences.slice(0, 30)) {
			const row = tbody.createEl('tr');
			row.createEl('td', {
				text: formatDate(occ.date, settings.dateFormat),
				cls: 'finance-date-col',
			});
			row.createEl('td', { cls: 'finance-desc-col', text: occ.description });
			row.createEl('td', {
				text: formatCurrency(occ.amount, settings.defaultCurrency, settings.dateFormat),
				cls: `finance-amount-col ${occ.amount >= 0 ? 'positive' : 'negative'}`,
			});
		}
	}
}

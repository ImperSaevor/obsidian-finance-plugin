import type FinancePlugin from '../../main';
import { ForecastModal } from '../modals/forecast-modal';
import {
	getAccountBalance,
	getForecastOccurrences,
	getProjectedBalance,
} from '../utils/calculations';
import { confirmAction } from '../utils/confirm';
import { formatCurrency, formatDate } from '../utils/format';

export function renderForecastsTab(el: HTMLElement, plugin: FinancePlugin, refresh: () => void): void {
	const store = plugin.store;
	const settings = plugin.settings;
	const accounts = store.getAccounts();
	const forecasts = store.getForecasts();

	const toolbar = el.createDiv({ cls: 'finance-toolbar' });
	toolbar.createEl('button', { text: '+ Prévision', cls: 'mod-cta' })
		.addEventListener('click', () => {
			new ForecastModal(plugin.app, store, null, accounts[0]?.id ?? null, refresh).open();
		});

	const projectionEl = el.createDiv({ cls: 'finance-projection' });
	projectionEl.createEl('h3', { text: 'Projections (12 mois)' });
	const projGrid = projectionEl.createDiv({ cls: 'finance-accounts-grid' });
	const toDate = new Date();
	toDate.setFullYear(toDate.getFullYear() + 1);
	const toDateStr = toDate.toISOString().slice(0, 10);

	for (const account of accounts) {
		const projected = getProjectedBalance(account, store.getTransactions(), forecasts, toDateStr);
		const current = getAccountBalance(account.id, store.getTransactions(), account.initialBalance);
		const card = projGrid.createDiv({ cls: 'finance-account-card' });
		card.style.borderLeftColor = account.color;
		card.createEl('h4', { text: account.name });
		card.createEl('div', { text: `Actuel : ${formatCurrency(current, account.currency, settings.dateFormat)}`, cls: 'finance-proj-current' });
		card.createEl('div', {
			text: `Prévu : ${formatCurrency(projected, account.currency, settings.dateFormat)}`,
			cls: `finance-balance ${projected >= 0 ? 'positive' : 'negative'}`,
		});
	}

	if (forecasts.length === 0) {
		el.createEl('p', { text: 'Aucune prévision définie.', cls: 'finance-empty' });
		return;
	}

	const table = el.createEl('table', { cls: 'finance-table' });
	const headRow = table.createEl('thead').createEl('tr');
	for (const col of ['Description', 'Compte', 'Montant', 'Fréquence', 'Début', 'Fin', 'Actions']) {
		headRow.createEl('th', { text: col });
	}

	const tbody = table.createEl('tbody');
	for (const f of forecasts) {
		const account = accounts.find(a => a.id === f.accountId);
		const row = tbody.createEl('tr');
		row.createEl('td', { text: f.description });
		row.createEl('td', { text: account?.name ?? '—' });
		row.createEl('td', {
			text: formatCurrency(f.amount, account?.currency ?? settings.defaultCurrency, settings.dateFormat),
			cls: f.amount >= 0 ? 'positive' : 'negative',
		});
		row.createEl('td', { text: f.frequency });
		row.createEl('td', { text: formatDate(f.startDate, settings.dateFormat) });
		row.createEl('td', { text: f.endDate ? formatDate(f.endDate, settings.dateFormat) : '—' });

		const actionsTd = row.createEl('td', { cls: 'finance-row-actions' });
		actionsTd.createEl('button', { text: '✎' })
			.addEventListener('click', () => {
				new ForecastModal(plugin.app, store, f, null, refresh).open();
			});
		actionsTd.createEl('button', { text: '✕', cls: 'mod-warning' })
			.addEventListener('click', async () => {
				if (await confirmAction(plugin.app, 'Supprimer', `Supprimer la prévision « ${f.description} » ?`)) {
					await store.deleteForecast(f.id);
					refresh();
				}
			});
	}

	const today = new Date().toISOString().slice(0, 10);
	const future = new Date();
	future.setMonth(future.getMonth() + 3);
	const occurrences = getForecastOccurrences(forecasts, today, future.toISOString().slice(0, 10));

	if (occurrences.length > 0) {
		el.createEl('h3', { text: 'Échéances à venir (3 mois)' });
		const occList = el.createDiv({ cls: 'finance-occurrences' });
		for (const occ of occurrences.slice(0, 20)) {
			const item = occList.createDiv({ cls: 'finance-occurrence-item' });
			item.createSpan({ text: formatDate(occ.date, settings.dateFormat), cls: 'finance-occ-date' });
			item.createSpan({ text: occ.description });
			item.createSpan({
				text: formatCurrency(occ.amount, settings.defaultCurrency, settings.dateFormat),
				cls: occ.amount >= 0 ? 'positive' : 'negative',
			});
		}
	}
}

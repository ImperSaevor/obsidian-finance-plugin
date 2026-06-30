import { Notice } from 'obsidian';
import type FinancePlugin from '../../main';
import { RecurringModal } from '../modals/recurring-modal';
import { confirmAction } from '../utils/confirm';
import { formatCurrency, formatDate } from '../utils/format';

export function renderRecurringTab(
	el: HTMLElement,
	plugin: FinancePlugin,
	selectedAccountId: string | null,
	onAccountChange: (id: string | null) => void,
	refresh: () => void,
): void {
	const store = plugin.store;
	const settings = plugin.settings;
	const accounts = store.getAccounts();
	let recurring = store.getRecurring();

	const toolbar = el.createDiv({ cls: 'finance-toolbar' });
	toolbar.createEl('button', { text: '+ Récurrence', cls: 'mod-cta' })
		.addEventListener('click', () => {
			new RecurringModal(plugin.app, store, settings, null, selectedAccountId, refresh).open();
		});
	toolbar.createEl('button', { text: 'Générer maintenant' })
		.addEventListener('click', async () => {
			const n = await store.processRecurringTransactions();
			new Notice(n > 0 ? `${n} transaction(s) générée(s).` : 'Aucune échéance à générer.');
			refresh();
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

	if (selectedAccountId) {
		recurring = recurring.filter(r => r.accountId === selectedAccountId);
	}

	if (recurring.length === 0) {
		el.createEl('p', { text: 'Aucune transaction récurrente.', cls: 'finance-empty' });
		return;
	}

	const table = el.createEl('table', { cls: 'finance-table' });
	const headRow = table.createEl('thead').createEl('tr');
	for (const col of ['Description', 'Compte', 'Montant', 'Fréquence', 'Début', 'Dernière génération', 'Actions']) {
		headRow.createEl('th', { text: col });
	}

	const tbody = table.createEl('tbody');
	for (const r of recurring) {
		const account = accounts.find(a => a.id === r.accountId);
		const row = tbody.createEl('tr');
		row.createEl('td', { text: r.description });
		row.createEl('td', { text: account?.name ?? '—' });
		row.createEl('td', {
			text: formatCurrency(r.amount, account?.currency ?? settings.defaultCurrency, settings.dateFormat),
			cls: r.type === 'income' ? 'positive' : 'negative',
		});
		row.createEl('td', { text: r.frequency });
		row.createEl('td', { text: formatDate(r.startDate, settings.dateFormat) });
		row.createEl('td', { text: r.lastGeneratedDate ? formatDate(r.lastGeneratedDate, settings.dateFormat) : '—' });

		const actions = row.createEl('td', { cls: 'finance-row-actions' });
		actions.createEl('button', { text: '✎' })
			.addEventListener('click', () => {
				new RecurringModal(plugin.app, store, settings, r, null, refresh).open();
			});
		actions.createEl('button', { text: '✕', cls: 'mod-warning' })
			.addEventListener('click', async () => {
				if (await confirmAction(plugin.app, 'Supprimer', `Supprimer la récurrence « ${r.description} » ?`)) {
					await store.deleteRecurring(r.id);
					refresh();
				}
			});
	}
}

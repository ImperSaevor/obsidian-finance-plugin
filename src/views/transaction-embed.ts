import type FinancePlugin from '../../main';
import { formatCurrency, formatDate } from '../utils/format';
import { openTransaction } from '../utils/transaction-links';
import { openNoteAtPath } from '../utils/note-links';
import { getTransactionNotePath } from '../utils/transaction-note';

export function renderTransactionEmbed(
	el: HTMLElement,
	plugin: FinancePlugin,
	txId: string,
): void {
	const tx = plugin.store.getTransaction(txId);
	if (!tx) {
		el.createEl('p', { text: 'Transaction introuvable.', cls: 'finance-empty' });
		return;
	}

	const account = plugin.store.getAccount(tx.accountId);
	const category = plugin.store.getCategories().find(c => c.id === tx.categoryId);
	const currency = account?.currency ?? plugin.settings.defaultCurrency;
	const settings = plugin.settings;

	const card = el.createDiv({ cls: 'finance-embed-block finance-tx-embed' });
	card.createEl('div', {
		text: tx.description,
		cls: 'finance-tx-embed-title',
	});

	const meta = card.createDiv({ cls: 'finance-tx-embed-meta' });
	meta.createSpan({ text: formatDate(tx.date, settings.dateFormat) });
	meta.createSpan({
		text: formatCurrency(tx.amount, currency, settings.dateFormat),
		cls: tx.amount >= 0 ? 'positive' : 'negative',
	});
	if (account) meta.createSpan({ text: account.name, cls: 'finance-occ-account' });
	if (category) meta.createSpan({ text: category.name, cls: 'finance-occ-account' });

	const actions = card.createDiv({ cls: 'finance-card-actions' });
	actions.createEl('button', { text: 'Ouvrir dans Finances' })
		.addEventListener('click', () => void openTransaction(plugin, tx.id));
	if (settings.transactionsAsNotes) {
		actions.createEl('button', { text: 'Voir la note' })
			.addEventListener('click', () => openNoteAtPath(
				plugin.app,
				getTransactionNotePath(tx, settings, plugin.store.getTransactions()),
			));
	}
}

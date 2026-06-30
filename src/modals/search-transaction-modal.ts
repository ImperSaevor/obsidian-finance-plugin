import { App, FuzzySuggestModal, Notice } from 'obsidian';
import type FinancePlugin from '../../main';
import { formatCurrency, formatDate } from '../utils/format';
import { TransactionModal } from './transaction-modal';

export class SearchTransactionModal extends FuzzySuggestModal<{ id: string; label: string }> {
	constructor(app: App, private plugin: FinancePlugin, private onRefresh: () => void) {
		super(app);
	}

	getItems(): { id: string; label: string }[] {
		const settings = this.plugin.settings;
		return this.plugin.store.getTransactions().map(tx => {
			const account = this.plugin.store.getAccount(tx.accountId);
			return {
				id: tx.id,
				label: `${formatDate(tx.date, settings.dateFormat)} · ${tx.description} · ${formatCurrency(tx.amount, account?.currency ?? settings.defaultCurrency, settings.dateFormat)}`,
			};
		});
	}

	getItemText(item: { id: string; label: string }): string {
		return item.label;
	}

	onChooseItem(item: { id: string; label: string }): void {
		const tx = this.plugin.store.getTransaction(item.id);
		if (!tx) {
			new Notice('Transaction introuvable.');
			return;
		}
		new TransactionModal(
			this.app,
			this.plugin.store,
			this.plugin.settings,
			tx,
			tx.accountId,
			this.onRefresh,
		).open();
	}
}

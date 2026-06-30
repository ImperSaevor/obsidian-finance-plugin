import { App, Modal, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { Transaction } from '../types';
import { todayISO } from '../utils/format';
import { addDatePickerSetting } from '../utils/date-input';

export class DuplicateTransactionModal extends Modal {
	private amount: number;
	private date: string;
	private description: string;
	private accountId: string;

	constructor(
		app: App,
		private store: FinanceStore,
		private source: Transaction,
		private onSave: () => void,
	) {
		super(app);
		this.amount = Math.abs(source.amount);
		this.date = todayISO();
		this.description = source.description;
		this.accountId = source.accountId;
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.store.getAccounts();

		contentEl.empty();
		contentEl.createEl('h2', { text: 'Créer depuis une transaction' });
		contentEl.createEl('p', {
			text: `Source : ${this.source.description} (${this.source.amount})`,
			cls: 'finance-modal-hint',
		});

		new Setting(contentEl)
			.setName('Compte')
			.addDropdown(drop => {
				for (const a of accounts) drop.addOption(a.id, a.name);
				drop.setValue(this.accountId);
				drop.onChange(v => { this.accountId = v; });
			});

		addDatePickerSetting(contentEl, 'Date', this.date, (v) => {
			this.date = v;
		});

		new Setting(contentEl)
			.setName('Montant')
			.addText(text => text
				.setValue(String(this.amount))
				.onChange(v => { this.amount = parseFloat(v) || 0; }));

		new Setting(contentEl)
			.setName('Description')
			.addText(text => text
				.setValue(this.description)
				.onChange(v => { this.description = v; }));

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Créer', cls: 'mod-cta' })
			.addEventListener('click', async () => {
				const sign = this.source.amount < 0 ? -1 : 1;
				await this.store.createFromTransaction(this.source.id, {
					accountId: this.accountId,
					date: this.date,
					amount: sign * this.amount,
					description: this.description,
				});
				this.onSave();
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class QuickAmountModal extends Modal {
	private amount = 0;
	private description = '';
	private accountId: string;
	private type: 'income' | 'expense' = 'expense';

	constructor(
		app: App,
		private store: FinanceStore,
		defaultAccountId: string | null,
		private onSave: () => void,
	) {
		super(app);
		this.accountId = defaultAccountId ?? store.getAccounts()[0]?.id ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.store.getAccounts();

		contentEl.empty();
		contentEl.createEl('h2', { text: 'Transaction rapide (montant)' });

		new Setting(contentEl)
			.setName('Compte')
			.addDropdown(drop => {
				for (const a of accounts) drop.addOption(a.id, a.name);
				drop.setValue(this.accountId);
				drop.onChange(v => { this.accountId = v; });
			});

		new Setting(contentEl)
			.setName('Type')
			.addDropdown(drop => {
				drop.addOption('expense', 'Dépense');
				drop.addOption('income', 'Revenu');
				drop.setValue(this.type);
				drop.onChange(v => { this.type = v as 'income' | 'expense'; });
			});

		new Setting(contentEl)
			.setName('Montant')
			.addText(text => text
				.setPlaceholder('0.00')
				.onChange(v => { this.amount = parseFloat(v) || 0; }));

		new Setting(contentEl)
			.setName('Description')
			.addText(text => text
				.onChange(v => { this.description = v; }));

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Créer', cls: 'mod-cta' })
			.addEventListener('click', async () => {
				if (!this.accountId || !this.description.trim() || this.amount <= 0) return;
				await this.store.addTransaction({
					accountId: this.accountId,
					date: todayISO(),
					amount: this.amount,
					description: this.description,
					tags: [],
					type: this.type,
				});
				this.onSave();
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

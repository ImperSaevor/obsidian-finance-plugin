import { App, Modal, Notice, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { FinancePluginSettings } from '../settings';
import { getCategoriesForAccount } from '../utils/categories';
import { todayISO } from '../utils/format';

export class QuickExpenseModal extends Modal {
	private description = '';
	private amount = '';
	private accountId = '';
	private categoryId = '';

	constructor(
		app: App,
		private store: FinanceStore,
		private settings: FinancePluginSettings,
		private onSave: () => void,
	) {
		super(app);
		const accounts = store.getAccounts();
		this.accountId = accounts[0]?.id ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.store.getAccounts();
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Dépense rapide' });

		new Setting(contentEl).setName('Description').addText(t => {
			t.setValue(this.description).onChange(v => { this.description = v; });
			t.inputEl.focus();
		});

		new Setting(contentEl).setName('Montant').addText(t => t
			.setPlaceholder('0.00')
			.onChange(v => { this.amount = v; }));

		new Setting(contentEl).setName('Compte').addDropdown(drop => {
			for (const a of accounts) drop.addOption(a.id, a.name);
			drop.setValue(this.accountId);
			drop.onChange(v => { this.accountId = v; this.refreshCategories(); });
		});

		const catSetting = new Setting(contentEl).setName('Catégorie');
		this.renderCategoryDropdown(catSetting);

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Enregistrer', cls: 'mod-cta' })
			.addEventListener('click', () => void this.save());
	}

	private renderCategoryDropdown(setting: Setting): void {
		setting.clear();
		const cats = getCategoriesForAccount(this.store.getCategories(), this.accountId);
		setting.setName('Catégorie').addDropdown(drop => {
			drop.addOption('', '— Aucune —');
			for (const c of cats) drop.addOption(c.id, c.name);
			drop.setValue(this.categoryId);
			drop.onChange(v => { this.categoryId = v; });
		});
	}

	private refreshCategories(): void {
		this.categoryId = '';
		this.onOpen();
	}

	private async save(): Promise<void> {
		const amount = parseFloat(this.amount.replace(',', '.'));
		if (!this.description.trim() || !this.accountId || Number.isNaN(amount) || amount <= 0) {
			new Notice('Description, compte et montant positif requis.');
			return;
		}
		await this.store.addTransaction({
			accountId: this.accountId,
			date: todayISO(),
			amount: -amount,
			description: this.description.trim(),
			categoryId: this.categoryId || undefined,
			tags: [],
			type: 'expense',
		});
		this.onSave();
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

import { App, Modal, Notice, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { Budget } from '../types';
import { getCategoriesForAccount } from '../utils/categories';

export class BudgetModal extends Modal {
	private budget: Partial<Budget>;
	private onSave: () => void;

	constructor(
		app: App,
		private store: FinanceStore,
		budget: Budget | null,
		defaultAccountId: string | null,
		onSave: () => void,
	) {
		super(app);
		this.onSave = onSave;
		this.budget = budget
			? { ...budget }
			: { categoryId: '', accountId: defaultAccountId ?? undefined, amount: 0 };
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.store.getAccounts();
		const accountId = this.budget.accountId ?? accounts[0]?.id ?? '';
		const categories = getCategoriesForAccount(this.store.getCategories(), accountId);

		contentEl.empty();
		contentEl.createEl('h2', { text: this.budget.id ? 'Modifier le budget' : 'Nouveau budget mensuel' });

		new Setting(contentEl).setName('Compte (optionnel)').addDropdown(drop => {
			drop.addOption('', '— Tous les comptes —');
			for (const a of accounts) drop.addOption(a.id, a.name);
			drop.setValue(this.budget.accountId ?? '');
			drop.onChange(v => { this.budget.accountId = v || undefined; this.onOpen(); });
		});

		new Setting(contentEl).setName('Catégorie').addDropdown(drop => {
			for (const c of categories) drop.addOption(c.id, c.name);
			drop.setValue(this.budget.categoryId ?? '');
			drop.onChange(v => { this.budget.categoryId = v; });
		});

		new Setting(contentEl).setName('Plafond mensuel').addText(t => t
			.setValue(String(this.budget.amount ?? 0))
			.onChange(v => { this.budget.amount = parseFloat(v) || 0; }));

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Enregistrer', cls: 'mod-cta' })
			.addEventListener('click', async () => {
				if (!this.budget.categoryId || !this.budget.amount) {
					new Notice('Catégorie et montant requis.');
					return;
				}
				if (this.budget.id) {
					await this.store.updateBudget(this.budget as Budget);
				} else {
					await this.store.addBudget({
						categoryId: this.budget.categoryId,
						accountId: this.budget.accountId,
						amount: this.budget.amount,
					});
				}
				this.onSave();
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

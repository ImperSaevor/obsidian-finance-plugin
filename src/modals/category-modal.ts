import { App, Modal, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { Category } from '../types';
import { getCategoriesForAccount, getRootCategories } from '../utils/categories';

import { CATEGORY_COLORS, pickNextColor } from '../utils/colors';

const COLORS = CATEGORY_COLORS;

export class CategoryModal extends Modal {
	private category: Partial<Category>;
	private onSave: () => void;

	constructor(
		app: App,
		private store: FinanceStore,
		category: Category | null,
		onSave: () => void,
		defaultParentId?: string,
		defaultAccountId?: string,
	) {
		super(app);
		this.onSave = onSave;
		this.category = category
			? { ...category }
			: {
				name: '',
				color: pickNextColor(this.store.getCategories().map(c => c.color)),
				parentId: defaultParentId,
				accountId: defaultAccountId,
			};
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.store.getAccounts();
		const allCategories = this.store.getCategories().filter(c => c.id !== this.category.id);
		const scopeAccountId = this.category.accountId;

		contentEl.empty();
		contentEl.createEl('h2', { text: this.category.id ? 'Modifier la catégorie' : 'Nouvelle catégorie' });

		new Setting(contentEl)
			.setName('Compte')
			.setDesc('Laissez global pour toutes les comptes, ou liez à un compte spécifique')
			.addDropdown(drop => {
				drop.addOption('', '— Global (tous les comptes) —');
				for (const a of accounts) drop.addOption(a.id, a.name);
				drop.setValue(this.category.accountId ?? '');
				drop.onChange(v => {
					this.category.accountId = v || undefined;
					this.category.parentId = undefined;
					this.onOpen();
				});
			});

		new Setting(contentEl)
			.setName('Nom')
			.addText(text => text
				.setValue(this.category.name ?? '')
				.onChange(v => { this.category.name = v; }));

		const parentPool = scopeAccountId
			? getCategoriesForAccount(allCategories, scopeAccountId)
			: allCategories.filter(c => !c.accountId);

		new Setting(contentEl)
			.setName('Catégorie parente (division)')
			.addDropdown(drop => {
				drop.addOption('', '— Aucune (racine) —');
				for (const c of getRootCategories(parentPool, scopeAccountId ?? null)) {
					drop.addOption(c.id, c.name);
				}
				drop.setValue(this.category.parentId ?? '');
				drop.onChange(v => { this.category.parentId = v || undefined; });
			});

		new Setting(contentEl)
			.setName('Couleur')
			.addDropdown(drop => {
				for (const c of COLORS) drop.addOption(c, c);
				drop.setValue(this.category.color ?? COLORS[0]);
				drop.onChange(v => { this.category.color = v; });
			});

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Enregistrer', cls: 'mod-cta' })
			.addEventListener('click', async () => {
				if (!this.category.name?.trim()) return;
				if (this.category.id) {
					await this.store.updateCategory(this.category as Category);
				} else {
					await this.store.addCategory({
						name: this.category.name,
						color: this.category.color ?? COLORS[0],
						parentId: this.category.parentId,
						accountId: this.category.accountId,
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

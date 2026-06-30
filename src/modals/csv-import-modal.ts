import { App, Modal, Notice, Setting } from 'obsidian';
import type FinancePlugin from '../../main';
import { parseCsvTransactions, csvRowToTransaction } from '../utils/csv-import';
import { getCategoriesForAccount } from '../utils/categories';
import { pickNextColor } from '../utils/colors';

export class CsvImportModal extends Modal {
	private content = '';
	private accountId = '';

	constructor(
		app: App,
		private plugin: FinancePlugin,
		private onDone: () => void,
	) {
		super(app);
		const accounts = plugin.store.getAccounts();
		this.accountId = accounts[0]?.id ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.plugin.store.getAccounts();
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Importer des transactions (CSV)' });
		contentEl.createEl('p', {
			text: 'Colonnes attendues : date, description, montant. Optionnel : type, catégorie, tags. Séparateur auto-détecté (, ; ou tab).',
			cls: 'finance-modal-hint',
		});

		new Setting(contentEl)
			.setName('Compte cible')
			.addDropdown(drop => {
				for (const a of accounts) drop.addOption(a.id, a.name);
				drop.setValue(this.accountId);
				drop.onChange(v => { this.accountId = v; });
			});

		new Setting(contentEl)
			.setName('Fichier CSV')
			.addTextArea(text => {
				text.inputEl.rows = 10;
				text.setPlaceholder('Collez le contenu CSV ici…');
				text.onChange(v => { this.content = v; });
			});

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Importer', cls: 'mod-cta' })
			.addEventListener('click', () => void this.import());
	}

	private async import(): Promise<void> {
		if (!this.accountId) {
			new Notice('Sélectionnez un compte.');
			return;
		}
		const { rows, errors } = parseCsvTransactions(this.content);
		if (errors.length > 0) {
			new Notice(errors.slice(0, 3).join('\n'));
			return;
		}
		if (rows.length === 0) {
			new Notice('Aucune ligne valide à importer.');
			return;
		}

		const store = this.plugin.store;
		const categories = getCategoriesForAccount(store.getCategories(), this.accountId);
		const usedColors = categories.map(c => c.color);
		const categoryByName = new Map(categories.map(c => [c.name.toLowerCase(), c]));

		let imported = 0;
		for (const row of rows) {
			let categoryId: string | undefined;
			if (row.categoryName) {
				let cat = categoryByName.get(row.categoryName.toLowerCase());
				if (!cat) {
					cat = await store.addCategory({
						name: row.categoryName,
						color: pickNextColor(usedColors),
						accountId: this.accountId,
					});
					usedColors.push(cat.color);
					categoryByName.set(row.categoryName.toLowerCase(), cat);
				}
				categoryId = cat.id;
			}
			await store.addTransaction(csvRowToTransaction(row, this.accountId, categoryId));
			imported++;
		}

		new Notice(`${imported} transaction(s) importée(s).`);
		this.onDone();
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

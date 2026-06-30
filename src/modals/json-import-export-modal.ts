import { App, Modal, Notice, Setting } from 'obsidian';
import type FinancePlugin from '../../main';

export class JsonImportExportModal extends Modal {
	constructor(
		app: App,
		private plugin: FinancePlugin,
		private mode: 'export' | 'import',
		private onDone: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', {
			text: this.mode === 'export' ? 'Exporter les données (JSON)' : 'Importer les données (JSON)',
		});

		if (this.mode === 'export') {
			const json = this.plugin.store.exportData();
			new Setting(contentEl)
				.setName('Données')
				.addTextArea(text => {
					text.inputEl.rows = 14;
					text.setValue(json);
					text.inputEl.readOnly = true;
				});
			const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
			btnRow.createEl('button', { text: 'Fermer' })
				.addEventListener('click', () => this.close());
			btnRow.createEl('button', { text: 'Copier', cls: 'mod-cta' })
				.addEventListener('click', async () => {
					await navigator.clipboard.writeText(json);
					new Notice('JSON copié dans le presse-papiers.');
				});
		} else {
			let json = '';
			let importMode: 'merge' | 'replace' = 'merge';
			contentEl.createEl('p', {
				text: 'Collez un export JSON. Fusion = ajoute les éléments inconnus. Remplacer = écrase toutes les données.',
				cls: 'finance-modal-hint',
			});
			new Setting(contentEl)
				.setName('Mode')
				.addDropdown(drop => {
					drop.addOption('merge', 'Fusionner');
					drop.addOption('replace', 'Remplacer tout');
					drop.onChange(v => { importMode = v as 'merge' | 'replace'; });
				});
			new Setting(contentEl)
				.setName('JSON')
				.addTextArea(text => {
					text.inputEl.rows = 14;
					text.onChange(v => { json = v; });
				});
			const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
			btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
				.addEventListener('click', () => this.close());
			btnRow.createEl('button', { text: 'Importer', cls: 'mod-cta' })
				.addEventListener('click', async () => {
					try {
						const result = await this.plugin.store.importData(json, { mode: importMode });
						const total = result.accounts + result.categories + result.transactions
							+ result.forecasts + result.recurring + result.budgets;
						new Notice(`Import terminé : ${total} élément(s).`);
						this.onDone();
						this.close();
					} catch {
						new Notice('JSON invalide ou import impossible.');
					}
				});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

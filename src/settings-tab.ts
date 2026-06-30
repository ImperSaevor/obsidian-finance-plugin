import { App, PluginSettingTab, Setting } from 'obsidian';
import type FinancePlugin from '../main';
import { JsonImportExportModal } from './modals/json-import-export-modal';

export class FinanceSettingTab extends PluginSettingTab {
	plugin: FinancePlugin;

	constructor(app: App, plugin: FinancePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Paramètres Finance' });

		new Setting(containerEl)
			.setName('Dossier de données')
			.setDesc('Dossier dans le coffre où sont stockées les données financières')
			.addText(text => text
				.setPlaceholder('Finance')
				.setValue(this.plugin.settings.dataFolder)
				.onChange(async (value) => {
					this.plugin.settings.dataFolder = value || 'Finance';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Devise par défaut')
			.setDesc('Devise utilisée pour les nouveaux comptes')
			.addText(text => text
				.setPlaceholder('EUR')
				.setValue(this.plugin.settings.defaultCurrency)
				.onChange(async (value) => {
					this.plugin.settings.defaultCurrency = value || 'EUR';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Format de date')
			.setDesc('Locale pour l\'affichage des dates et montants (ex: fr-FR, en-US)')
			.addText(text => text
				.setPlaceholder('fr-FR')
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value || 'fr-FR';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Transactions par page')
			.setDesc('Nombre de transactions affichées par page dans l\'onglet Transactions')
			.addText(text => text
				.setValue(String(this.plugin.settings.transactionsPerPage))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					this.plugin.settings.transactionsPerPage = Number.isFinite(n) && n > 0 ? n : 50;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Synchroniser les notes liées')
			.setDesc('Ajoute une entrée cliquable dans la section « Finances liées » de la note liée à chaque transaction')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncTransactionToLinkedNote)
				.onChange(async (value) => {
					this.plugin.settings.syncTransactionToLinkedNote = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Transactions en notes')
			.setDesc('Crée une note Obsidian par transaction (dossier Transactions)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.transactionsAsNotes)
				.onChange(async (value) => {
					this.plugin.settings.transactionsAsNotes = value;
					await this.plugin.saveSettings();
					if (value) {
						void this.plugin.syncAllTransactionNotes();
					}
				}));

		new Setting(containerEl)
			.setName('Dossier des notes de transaction')
			.setDesc('Emplacement des notes générées pour chaque transaction')
			.addText(text => text
				.setPlaceholder('Finance/Transactions')
				.setValue(this.plugin.settings.transactionNotesFolder)
				.onChange(async (value) => {
					this.plugin.settings.transactionNotesFolder = value || 'Finance/Transactions';
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Import / export' });

		new Setting(containerEl)
			.setName('Exporter JSON')
			.setDesc('Copier toutes les données du plugin au format JSON')
			.addButton(btn => btn
				.setButtonText('Exporter')
				.onClick(() => {
					new JsonImportExportModal(this.app, this.plugin, 'export', () => {}).open();
				}));

		new Setting(containerEl)
			.setName('Importer JSON')
			.setDesc('Restaurer ou fusionner des données depuis un export JSON')
			.addButton(btn => btn
				.setButtonText('Importer')
				.onClick(() => {
					new JsonImportExportModal(this.app, this.plugin, 'import', () => {}).open();
				}));
	}
}

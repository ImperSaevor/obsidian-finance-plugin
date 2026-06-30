import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';

import { FinanceStore } from './src/store/finance-store';

import { DEFAULT_SETTINGS, DEFAULT_UI_STATE, type FinancePluginSettings } from './src/settings';

import { FinanceSettingTab } from './src/settings-tab';

import { TransactionModal } from './src/modals/transaction-modal';

import { FINANCE_VIEW_TYPE, FinanceView } from './src/views/finance-view';

import { enhanceFinanceTxLinks } from './src/utils/transaction-links';

import { syncTransactionNote } from './src/utils/transaction-note';

import { renderTransactionEmbed } from './src/views/transaction-embed';

import { CsvImportModal } from './src/modals/csv-import-modal';

import { JsonImportExportModal } from './src/modals/json-import-export-modal';

import { QuickExpenseModal } from './src/modals/quick-expense-modal';

import { SearchTransactionModal } from './src/modals/search-transaction-modal';



export default class FinancePlugin extends Plugin {

	settings: FinancePluginSettings;

	store: FinanceStore;



	async onload() {
		await this.loadSettings();

		this.store = new FinanceStore(this.app, () => this.settings);

		try {
			await this.store.load();
		} catch (error) {
			console.error('[Finance] Échec du chargement des données', error);
			new Notice('Finance : impossible de charger les données. Vérifiez Finance/finance-data.json');
		}

		try {
			const generated = await this.store.processRecurringTransactions();
			if (generated > 0) {
				new Notice(`${generated} transaction(s) récurrente(s) générée(s).`);
			}
		} catch (error) {
			console.error('[Finance] Échec génération récurrentes', error);
		}



		this.registerView(FINANCE_VIEW_TYPE, (leaf) => new FinanceView(leaf, this));



		this.addRibbonIcon('wallet', 'Ouvrir Finances', () => {

			this.activateView();

		});



		this.addCommand({

			id: 'open-finance-view',

			name: 'Ouvrir la gestion des finances',

			callback: () => this.activateView(),

		});



		this.addCommand({

			id: 'quick-expense',

			name: 'Dépense rapide',

			callback: () => {

				new QuickExpenseModal(this.app, this.store, this.settings, () => this.activateView()).open();

			},

		});



		this.addCommand({

			id: 'search-transaction',

			name: 'Rechercher une transaction',

			callback: () => {

				new SearchTransactionModal(this.app, this, () => this.activateView()).open();

			},

		});



		this.addCommand({

			id: 'reload-finance-data',

			name: 'Recharger les données financières',

			callback: async () => {

				await this.store.load();

				new Notice('Données financières rechargées');

			},

		});



		this.addCommand({

			id: 'export-finance-json',

			name: 'Exporter les données (JSON)',

			callback: () => {

				new JsonImportExportModal(this.app, this, 'export', () => {}).open();

			},

		});



		this.addCommand({

			id: 'import-finance-json',

			name: 'Importer les données (JSON)',

			callback: () => {

				new JsonImportExportModal(this.app, this, 'import', () => this.activateView()).open();

			},

		});



		this.addCommand({

			id: 'import-finance-csv',

			name: 'Importer des transactions (CSV)',

			callback: () => {

				new CsvImportModal(this.app, this, () => this.activateView()).open();

			},

		});



		this.addCommand({

			id: 'export-finance-note',

			name: 'Exporter le rapport finance en note',

			callback: () => {

				void import('./src/views/note-renderer').then(m => m.exportFinanceNote(this, null));

			},

		});



		this.addCommand({

			id: 'sync-transaction-notes',

			name: 'Synchroniser les notes de transaction',

			callback: async () => {

				await this.syncAllTransactionNotes();

			},

		});



		this.addCommand({

			id: 'generate-recurring',

			name: 'Générer les transactions récurrentes',

			callback: async () => {

				const n = await this.store.processRecurringTransactions();

				new Notice(n > 0 ? `${n} transaction(s) générée(s).` : 'Aucune échéance à générer.');

				await this.activateView();

			},

		});



		this.addCommand({

			id: 'create-transaction-from-active-note',

			name: 'Créer une transaction liée à la note active',

			callback: () => {

				const file = this.app.workspace.getActiveFile();

				if (!file) {

					new Notice('Ouvrez une note pour la lier à une transaction.');

					return;

				}

				const accounts = this.store.getAccounts();

				new TransactionModal(

					this.app,

					this.store,

					this.settings,

					null,

					accounts[0]?.id ?? null,

					() => this.activateView(),

					file.path,

				).open();

			},

		});



		this.registerMarkdownCodeBlockProcessor('finance', (source, el) => {

			const accountId = source.trim();

			void import('./src/views/note-renderer').then(m => {

				m.renderFinanceEmbed(el, this, accountId || null);

			});

		});



		this.registerMarkdownCodeBlockProcessor('finance-tx', (source, el) => {

			void renderTransactionEmbed(el, this, source.trim());

		});



		this.registerMarkdownPostProcessor((el) => {

			enhanceFinanceTxLinks(el, this);

		});



		this.addSettingTab(new FinanceSettingTab(this.app, this));

	}



	async syncAllTransactionNotes(): Promise<void> {

		const settings = this.settings;

		if (!settings.transactionsAsNotes) {

			new Notice('Activez « Transactions en notes » dans les paramètres du plugin.');

			return;

		}

		for (const tx of this.store.getTransactions()) {

			await syncTransactionNote(this.app, this.store, tx, settings);

		}

		await this.store.resyncAllNoteArtifacts();

		new Notice('Notes de transaction synchronisées.');

	}



	onunload() {

		this.app.workspace.detachLeavesOfType(FINANCE_VIEW_TYPE);

	}



	async activateView() {

		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(FINANCE_VIEW_TYPE)[0] ?? null;



		if (!leaf) {

			leaf = workspace.getRightLeaf(false);

			if (leaf) {

				await leaf.setViewState({ type: FINANCE_VIEW_TYPE, active: true });

			}

		}



		if (leaf) {

			workspace.revealLeaf(leaf);

		}

	}



	async loadSettings() {

		const loaded = await this.loadData() ?? {};

		this.settings = {

			...DEFAULT_SETTINGS,

			...loaded,

			uiState: { ...DEFAULT_UI_STATE, ...loaded.uiState },

		};

	}



	async saveSettings(reloadStore = true) {
		await this.saveData(this.settings);
		if (reloadStore && this.store) {
			await this.store.load();
		}
	}

	async saveUiSettings() {
		await this.saveData(this.settings);
	}
}


import { ItemView, WorkspaceLeaf } from 'obsidian';
import type FinancePlugin from '../../main';
import { CsvImportModal } from '../modals/csv-import-modal';
import { DuplicateTransactionModal, QuickAmountModal } from '../modals/duplicate-transaction-modal';
import { ForecastModal } from '../modals/forecast-modal';
import { TransactionModal } from '../modals/transaction-modal';
import type { FinanceTabId } from '../types';
import { DEFAULT_UI_STATE } from '../settings';
import { applyFiltersAndSort, DEFAULT_TX_FILTER, hasActiveFilters, type TransactionFilterState } from '../utils/transaction-filters';
import { renderOverview } from './overview-renderer';
import { renderFinanceNoteTab } from './note-renderer';
import { renderMonthlyView } from './monthly-renderer';
import { renderChartsTab } from './charts-renderer';
import { renderBudgetsTab } from './budgets-renderer';
import { renderRecurringTab } from './recurring-renderer';
import {
	renderFilterSortBar,
	renderFilterResultsMeta,
	renderTransactionTable,
	type TransactionListContext,
} from './transaction-list-ui';
import { renderReconciliationTab } from './reconciliation-renderer';
import { createCollapse } from '../utils/collapse';

export const FINANCE_VIEW_TYPE = 'finance-view';

export class FinanceView extends ItemView {
	private activeTab: FinanceTabId;
	private selectedAccountId: string | null;
	private overviewAccountId: string | null;
	private noteAccountId: string | null;
	private txFilterState: TransactionFilterState;
	private overviewTxFilterState: TransactionFilterState;
	private monthlyTxFilterState: TransactionFilterState;
	private txPage = 0;
	private selectedTxIds = new Set<string>();
	private unsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: FinancePlugin) {
		super(leaf);
		const ui = { ...DEFAULT_UI_STATE, ...plugin.settings.uiState };
		this.activeTab = ui.activeTab;
		this.selectedAccountId = ui.selectedAccountId;
		this.overviewAccountId = ui.overviewAccountId ?? null;
		this.noteAccountId = ui.noteAccountId;
		this.txFilterState = { ...DEFAULT_TX_FILTER, ...ui.txFilterState };
		this.overviewTxFilterState = { ...DEFAULT_TX_FILTER, ...ui.overviewTxFilterState };
		this.monthlyTxFilterState = { ...DEFAULT_TX_FILTER, ...ui.monthlyTxFilterState };
		this.txPage = ui.txPage ?? 0;
	}

	getViewType(): string {
		return FINANCE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Finances';
	}

	getIcon(): string {
		return 'wallet';
	}

	async onOpen(): Promise<void> {
		this.unsubscribe = this.plugin.store.onChange(() => this.renderActiveTab());
		this.render();
	}

	async onClose(): Promise<void> {
		await this.persistUiState();
		this.unsubscribe?.();
		this.containerEl.empty();
	}

	private async persistUiState(): Promise<void> {
		this.plugin.settings.uiState = {
			activeTab: this.activeTab,
			selectedAccountId: this.selectedAccountId,
			overviewAccountId: this.overviewAccountId,
			noteAccountId: this.noteAccountId,
			txFilterState: this.txFilterState,
			overviewTxFilterState: this.overviewTxFilterState,
			monthlyTxFilterState: this.monthlyTxFilterState,
			txPage: this.txPage,
		};
		await this.plugin.saveUiSettings();
	}

	private saveUi(partial: Partial<typeof this.plugin.settings.uiState>): void {
		Object.assign(this, partial);
		void this.persistUiState();
	}

	private refresh(): void {
		this.renderActiveTab();
	}

	private renderActiveTab(): void {
		const content = this.containerEl.querySelector('.finance-content');
		if (content) {
			content.empty();
			this.renderTabContent(content as HTMLElement);
		} else {
			this.render();
		}
	}

	private resetTransactionsFiltersIfBlocking(): void {
		const transactions = this.plugin.store.getTransactions();
		const categories = this.plugin.store.getCategories();
		const processed = applyFiltersAndSort(transactions, this.txFilterState, categories);
		if (transactions.length > 0 && processed.length === 0 && hasActiveFilters(this.txFilterState)) {
			this.txFilterState = { ...DEFAULT_TX_FILTER };
		}
	}

	private render(): void {
		const container = this.containerEl;
		container.empty();
		container.addClass('finance-view');

		const header = container.createDiv({ cls: 'finance-header' });
		header.createEl('h1', { text: 'Gestion des finances' });

		const tabs = header.createDiv({ cls: 'finance-tabs' });
		const tabDefs: { id: FinanceTabId; label: string }[] = [
			{ id: 'overview', label: 'Vue d\'ensemble' },
			{ id: 'monthly', label: 'Par mois' },
			{ id: 'transactions', label: 'Transactions' },
			{ id: 'recurring', label: 'Récurrentes' },
			{ id: 'budgets', label: 'Budgets' },
			{ id: 'forecasts', label: 'Prévisions' },
			{ id: 'reconciliation', label: 'Réconciliation' },
			{ id: 'charts', label: 'Graphiques' },
			{ id: 'categories', label: 'Catégories' },
			{ id: 'note', label: 'Note' },
		];
		for (const tab of tabDefs) {
			const btn = tabs.createEl('button', {
				text: tab.label,
				cls: this.activeTab === tab.id ? 'finance-tab active' : 'finance-tab',
			});
			btn.addEventListener('click', () => {
				if (tab.id === 'transactions' && this.activeTab !== 'transactions') {
					this.resetTransactionsFiltersIfBlocking();
				}
				this.activeTab = tab.id;
				this.saveUi({ activeTab: tab.id });
				this.render();
			});
		}

		const content = container.createDiv({ cls: 'finance-content' });
		this.renderTabContent(content);
	}

	private renderTabContent(content: HTMLElement): void {
		switch (this.activeTab) {
			case 'overview':
				renderOverview(
					content,
					this.plugin,
					() => this.refresh(),
					this.overviewAccountId,
					(id) => { this.overviewAccountId = id; this.saveUi({ overviewAccountId: id }); this.renderActiveTab(); },
					this.overviewTxFilterState,
					(state) => { this.overviewTxFilterState = state; this.saveUi({ overviewTxFilterState: state }); this.renderActiveTab(); },
					(accountId) => {
						this.selectedAccountId = accountId;
						this.activeTab = 'reconciliation';
						this.saveUi({ selectedAccountId: accountId, activeTab: 'reconciliation' });
						this.render();
					},
				);
				break;
			case 'monthly':
				renderMonthlyView(
					content,
					this.plugin,
					() => this.refresh(),
					this.selectedAccountId,
					(id) => { this.selectedAccountId = id; this.saveUi({ selectedAccountId: id }); this.renderActiveTab(); },
					this.monthlyTxFilterState,
					(state) => { this.monthlyTxFilterState = state; this.saveUi({ monthlyTxFilterState: state }); this.renderActiveTab(); },
				);
				break;
			case 'transactions':
				this.renderTransactions(content);
				break;
			case 'recurring':
				renderRecurringTab(
					content,
					this.plugin,
					this.selectedAccountId,
					(id) => { this.selectedAccountId = id; this.saveUi({ selectedAccountId: id }); this.renderActiveTab(); },
					() => this.refresh(),
				);
				break;
			case 'budgets':
				renderBudgetsTab(
					content,
					this.plugin,
					this.selectedAccountId,
					(id) => { this.selectedAccountId = id; this.saveUi({ selectedAccountId: id }); this.renderActiveTab(); },
					() => this.refresh(),
				);
				break;
			case 'forecasts':
				void import('./forecasts-renderer').then(m => m.renderForecastsTab(
					content,
					this.plugin,
					() => this.refresh(),
					this.selectedAccountId,
					(id) => { this.selectedAccountId = id; this.saveUi({ selectedAccountId: id }); this.renderActiveTab(); },
				));
				break;
			case 'reconciliation':
				renderReconciliationTab(
					content,
					this.plugin,
					this.selectedAccountId,
					(id) => { this.selectedAccountId = id; this.saveUi({ selectedAccountId: id }); this.renderActiveTab(); },
					() => this.refresh(),
				);
				break;
			case 'charts':
				renderChartsTab(
					content,
					this.plugin,
					this.selectedAccountId,
					(id) => { this.selectedAccountId = id; this.saveUi({ selectedAccountId: id }); this.renderActiveTab(); },
				);
				break;
			case 'categories':
				void import('./categories-renderer').then(m => m.renderCategoriesTab(
					content,
					this.plugin,
					this.selectedAccountId,
					() => this.refresh(),
				));
				break;
			case 'note':
				void renderFinanceNoteTab(content, this.plugin, this.noteAccountId, (id) => {
					this.noteAccountId = id;
					this.saveUi({ noteAccountId: id });
					this.renderActiveTab();
				});
				break;
		}
	}

	private renderTransactions(el: HTMLElement): void {
		const store = this.plugin.store;
		const settings = this.plugin.settings;
		const accounts = store.getAccounts();
		const categories = store.getCategories();
		const transactions = store.getTransactions();

		const toolbar = el.createDiv({ cls: 'finance-toolbar' });
		const defaultAccount = this.selectedAccountId ?? accounts[0]?.id ?? null;

		toolbar.createEl('button', { text: '+ Transaction', cls: 'mod-cta' })
			.addEventListener('click', () => {
				new TransactionModal(this.app, store, settings, null, defaultAccount, () => this.refresh()).open();
			});
		toolbar.createEl('button', { text: '+ Montant rapide' })
			.addEventListener('click', () => {
				new QuickAmountModal(this.app, store, defaultAccount, () => this.refresh()).open();
			});
		toolbar.createEl('button', { text: 'Importer CSV' })
			.addEventListener('click', () => {
				new CsvImportModal(this.app, this.plugin, () => this.refresh()).open();
			});

		if (accounts.length > 0) {
			const accountRow = el.createDiv({ cls: 'finance-filter-row' });
			accountRow.createSpan({ text: 'Compte : ' });
			const select = accountRow.createEl('select');
			const allOpt = select.createEl('option', { text: 'Tous', value: '' });
			allOpt.selected = !this.selectedAccountId;
			for (const a of accounts) {
				const opt = select.createEl('option', { text: a.name, value: a.id });
				if (a.id === this.selectedAccountId) opt.selected = true;
			}
			select.addEventListener('change', () => {
				this.selectedAccountId = select.value || null;
				this.txPage = 0;
				this.saveUi({ selectedAccountId: this.selectedAccountId, txPage: 0 });
				this.renderActiveTab();
			});
		}

		const filtered = this.selectedAccountId
			? transactions.filter(t => t.accountId === this.selectedAccountId || t.transferToAccountId === this.selectedAccountId)
			: transactions;

		const ctx: TransactionListContext = {
			plugin: this.plugin,
			accounts,
			categories,
			allTransactions: transactions,
			settings,
			currency: settings.defaultCurrency,
			showAccountColumn: !this.selectedAccountId,
			onRefresh: () => this.refresh(),
			page: this.txPage,
			pageSize: settings.transactionsPerPage,
			onPageChange: (page) => {
				this.txPage = page;
				this.saveUi({ txPage: page });
				this.renderActiveTab();
			},
			selectedIds: this.selectedTxIds,
			onSelectionChange: (ids) => {
				this.selectedTxIds = ids;
				this.renderActiveTab();
			},
			enableBulk: true,
		};

		const processed = applyFiltersAndSort(filtered, this.txFilterState, categories);
		const onFilterChange = (state: TransactionFilterState) => {
			this.txFilterState = state;
			this.txPage = 0;
			this.saveUi({ txFilterState: state, txPage: 0 });
			this.renderActiveTab();
		};

		const listSection = el.createDiv({ cls: 'finance-transactions-main' });
		renderFilterResultsMeta(listSection, processed.length, filtered.length, this.txFilterState, onFilterChange);

		if (filtered.length === 0) {
			listSection.createEl('p', { text: 'Aucune transaction enregistrée.', cls: 'finance-empty' });
		} else if (processed.length === 0) {
			listSection.createEl('p', {
				text: 'Les filtres masquent toutes les transactions.',
				cls: 'finance-empty finance-filter-empty-hint',
			});
			listSection.createEl('button', { text: 'Réinitialiser les filtres', cls: 'finance-filter-reset-inline' })
				.addEventListener('click', () => onFilterChange({ ...DEFAULT_TX_FILTER }));
			renderTransactionTable(listSection, filtered, ctx);
		} else {
			renderTransactionTable(listSection, processed, ctx);
		}

		const filterCollapse = createCollapse(el, 'Filtres et tri', {
			open: hasActiveFilters(this.txFilterState),
			cls: 'finance-collapse-filters',
		});
		const allTags = [...new Set(transactions.flatMap(t => t.tags))].sort();
		renderFilterSortBar(filterCollapse, this.txFilterState, categories, allTags, onFilterChange);
	}
}

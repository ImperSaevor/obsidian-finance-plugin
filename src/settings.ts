import type { FinanceTabId } from './types';
import type { TransactionFilterState } from './utils/transaction-filters';
import { DEFAULT_TX_FILTER } from './utils/transaction-filters';

export interface FinanceUiState {
	activeTab: FinanceTabId;
	selectedAccountId: string | null;
	noteAccountId: string | null;
	txFilterState: TransactionFilterState;
	overviewTxFilterState: TransactionFilterState;
	monthlyTxFilterState: TransactionFilterState;
	txPage: number;
}

export interface FinancePluginSettings {
	dataFolder: string;
	defaultCurrency: string;
	dateFormat: string;
	/** Ajouter/mettre à jour une entrée dans la note liée à la transaction */
	syncTransactionToLinkedNote: boolean;
	/** Créer une note Obsidian par transaction */
	transactionsAsNotes: boolean;
	/** Dossier des notes de transaction */
	transactionNotesFolder: string;
	/** Transactions par page dans les listes */
	transactionsPerPage: number;
	/** État de l'interface (onglet, filtres…) */
	uiState: FinanceUiState;
}

export const DEFAULT_UI_STATE: FinanceUiState = {
	activeTab: 'overview',
	selectedAccountId: null,
	noteAccountId: null,
	txFilterState: { ...DEFAULT_TX_FILTER },
	overviewTxFilterState: { ...DEFAULT_TX_FILTER },
	monthlyTxFilterState: { ...DEFAULT_TX_FILTER },
	txPage: 0,
};

export const DEFAULT_SETTINGS: FinancePluginSettings = {
	dataFolder: 'Finance',
	defaultCurrency: 'EUR',
	dateFormat: 'fr-FR',
	syncTransactionToLinkedNote: true,
	transactionsAsNotes: false,
	transactionNotesFolder: 'Finance/Transactions',
	transactionsPerPage: 50,
	uiState: { ...DEFAULT_UI_STATE },
};

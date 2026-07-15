export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'other';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type ForecastFrequency = 'once' | 'weekly' | 'monthly' | 'yearly';
export type CalcOperator =
	| 'add'
	| 'subtract'
	| 'multiply'
	| 'percent_of'
	| 'add_percent_of_sum'
	| 'subtract_percent_of_sum'
	| 'multiply_sum';

export interface TransactionCalcLink {
	transactionId: string;
	/** Ignoré pour le premier lien (valeur initiale) */
	operator: CalcOperator;
	/** Multiplicateur ou pourcentage (percent_of) */
	factor?: number;
	/** Utiliser la valeur absolue de la transaction liée */
	useAbsolute?: boolean;
}

export interface AccountBalanceSnapshot {
	id: string;
	/** Date du relevé (YYYY-MM-DD) */
	date: string;
	actualBalance: number;
	note?: string;
}

export interface Account {
	id: string;
	name: string;
	type: AccountType;
	currency: string;
	initialBalance: number;
	/** Dernière saisie réelle (miroir du dernier snapshot) */
	actualBalance?: number;
	/** Historique des soldes réels saisis */
	balanceSnapshots?: AccountBalanceSnapshot[];
	color: string;
	createdAt: string;
}

export interface Category {
	id: string;
	name: string;
	color: string;
	parentId?: string;
	/** Absent = catégorie globale ; défini = réservée à ce compte */
	accountId?: string;
}

export interface Transaction {
	id: string;
	accountId: string;
	date: string;
	amount: number;
	description: string;
	categoryId?: string;
	tags: string[];
	type: TransactionType;
	transferToAccountId?: string;
	linkedTransactionId?: string;
	sourceTransactionId?: string;
	/** Montant calculé à partir d'autres transactions */
	useCalculatedAmount?: boolean;
	calculationLinks?: TransactionCalcLink[];
	/** Chemin vault de la note Obsidian liée (ex. Dossier/Ma note.md) */
	notePath?: string;
	/** ID de la règle récurrente ayant généré cette transaction */
	recurringId?: string;
}

export interface Forecast {
	id: string;
	accountId: string;
	categoryId?: string;
	description: string;
	amount: number;
	frequency: ForecastFrequency;
	startDate: string;
	endDate?: string;
}

export interface RecurringTransaction {
	id: string;
	accountId: string;
	categoryId?: string;
	description: string;
	amount: number;
	type: TransactionType;
	frequency: ForecastFrequency;
	startDate: string;
	endDate?: string;
	tags: string[];
	/** Dernière date pour laquelle une transaction a été générée */
	lastGeneratedDate?: string;
}

export interface Budget {
	id: string;
	categoryId: string;
	/** Optionnel : limite pour un compte précis */
	accountId?: string;
	/** Plafond mensuel */
	amount: number;
}

export interface FinanceData {
	dataVersion: number;
	accounts: Account[];
	categories: Category[];
	transactions: Transaction[];
	forecasts: Forecast[];
	recurring: RecurringTransaction[];
	budgets: Budget[];
}

export const EMPTY_FINANCE_DATA: FinanceData = {
	dataVersion: 3,
	accounts: [],
	categories: [],
	transactions: [],
	forecasts: [],
	recurring: [],
	budgets: [],
};

export type FinanceTabId =
	| 'overview'
	| 'monthly'
	| 'transactions'
	| 'recurring'
	| 'budgets'
	| 'forecasts'
	| 'reconciliation'
	| 'charts'
	| 'categories'
	| 'note';

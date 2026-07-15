import { App, Notice, TFile, normalizePath } from 'obsidian';
import type { FinancePluginSettings } from '../settings';
import type {
	Account,
	AccountBalanceSnapshot,
	Budget,
	Category,
	FinanceData,
	Forecast,
	RecurringTransaction,
	Transaction,
} from '../types';
import { EMPTY_FINANCE_DATA } from '../types';
import { migrateFinanceData } from '../utils/data-migration';
import { validateAndRepairFinanceData } from '../utils/data-validation';
import { generateId } from '../utils/id';
import { getRecurringDueDates } from '../utils/recurring';
import { removeTransactionFromNote, syncTransactionInNote, syncTransactionNote, deleteTransactionNote } from '../utils/transaction-note';
import { computeLinkedAmount, stripInvalidLinks } from '../utils/transaction-calc';
import { ensureVaultFolder } from '../utils/vault-folders';
import { syncAccountActualBalance } from '../utils/reconciliation';

const DATA_FILE = 'finance-data.json';

export interface ImportDataOptions {
	mode: 'replace' | 'merge';
}

export interface ImportDataResult {
	accounts: number;
	categories: number;
	transactions: number;
	forecasts: number;
	recurring: number;
	budgets: number;
}

export class FinanceStore {
	private data: FinanceData = { ...EMPTY_FINANCE_DATA };
	private dataPath: string;
	private listeners: Array<() => void> = [];
	lastValidationWarnings: string[] = [];

	constructor(
		private app: App,
		private getSettings: () => FinancePluginSettings,
	) {
		this.dataPath = this.resolveDataPath();
	}

	private resolveDataPath(): string {
		const folder = normalizePath(this.getSettings().dataFolder);
		return normalizePath(`${folder}/${DATA_FILE}`);
	}

	private async ensureDataFolder(): Promise<void> {
		await ensureVaultFolder(this.app, normalizePath(this.getSettings().dataFolder));
	}

	private async backupCorruptFile(content: string): Promise<void> {
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const backupPath = normalizePath(`${this.getSettings().dataFolder}/finance-data.corrupt.${stamp}.json`);
		try {
			await this.app.vault.create(backupPath, content);
		} catch {
			// ignore backup failure
		}
	}

	async load(): Promise<void> {
		this.dataPath = this.resolveDataPath();
		await this.ensureDataFolder();

		const file = this.app.vault.getAbstractFileByPath(this.dataPath);
		if (file instanceof TFile) {
			const content = await this.app.vault.read(file);
			try {
				const parsed = JSON.parse(content);
				this.data = migrateFinanceData(parsed);
				const report = validateAndRepairFinanceData(this.data);
				this.lastValidationWarnings = report.orphanWarnings;
				this.recalculateDerived();
				if (report.orphanWarnings.length > 0) {
					await this.save();
				}
			} catch {
				await this.backupCorruptFile(content);
				const recovered = await this.tryRecoverFromBackup();
				if (!recovered) {
					this.data = { ...EMPTY_FINANCE_DATA };
					new Notice('Données financières corrompues. Une sauvegarde a été créée. Données réinitialisées.');
				}
			}
		} else if (await this.app.vault.adapter.exists(this.dataPath)) {
			try {
				const content = await this.app.vault.adapter.read(this.dataPath);
				const parsed = JSON.parse(content);
				this.data = migrateFinanceData(parsed);
				const report = validateAndRepairFinanceData(this.data);
				this.lastValidationWarnings = report.orphanWarnings;
				this.recalculateDerived();
			} catch {
				this.data = { ...EMPTY_FINANCE_DATA };
				await this.save();
			}
		} else {
			this.data = { ...EMPTY_FINANCE_DATA };
			await this.save();
		}
	}

	private async tryRecoverFromBackup(): Promise<boolean> {
		const folder = normalizePath(this.getSettings().dataFolder);
		const files = this.app.vault.getFiles().filter(
			f => f.path.startsWith(`${folder}/`) && f.name.startsWith('finance-data.corrupt.'),
		);
		if (files.length === 0) return false;
		files.sort((a, b) => b.stat.mtime - a.stat.mtime);
		try {
			const content = await this.app.vault.read(files[0]);
			const parsed = JSON.parse(content);
			this.data = migrateFinanceData(parsed);
			validateAndRepairFinanceData(this.data);
			this.recalculateDerived();
			new Notice('Données restaurées depuis une sauvegarde de secours.');
			await this.save();
			return true;
		} catch {
			return false;
		}
	}

	private async save(): Promise<void> {
		await this.ensureDataFolder();
		this.data.dataVersion = EMPTY_FINANCE_DATA.dataVersion;
		const content = JSON.stringify(this.data, null, 2);
		const file = this.app.vault.getAbstractFileByPath(this.dataPath);
		if (file instanceof TFile) {
			await this.app.vault.modify(file, content);
		} else if (await this.app.vault.adapter.exists(this.dataPath)) {
			const existing = this.app.vault.getAbstractFileByPath(this.dataPath);
			if (existing instanceof TFile) {
				await this.app.vault.modify(existing, content);
			} else {
				await this.app.vault.adapter.write(this.dataPath, content);
			}
		} else {
			try {
				await this.app.vault.create(this.dataPath, content);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				if (msg.toLowerCase().includes('already exists')) {
					const existing = this.app.vault.getAbstractFileByPath(this.dataPath);
					if (existing instanceof TFile) {
						await this.app.vault.modify(existing, content);
					} else {
						await this.app.vault.adapter.write(this.dataPath, content);
					}
				} else {
					throw error;
				}
			}
		}
		this.notify();
	}

	onChange(listener: () => void): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter(l => l !== listener);
		};
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	private recalculateDerived(): void {
		const ids = new Set(this.data.transactions.map(t => t.id));
		for (const tx of this.data.transactions) {
			if (tx.calculationLinks?.length) {
				tx.calculationLinks = stripInvalidLinks(tx.calculationLinks, ids);
				if (tx.calculationLinks.length === 0) {
					tx.useCalculatedAmount = false;
				}
			}
			if (tx.useCalculatedAmount && tx.calculationLinks?.length) {
				tx.amount = computeLinkedAmount(tx.calculationLinks, this.data.transactions, tx.type);
			}
		}
	}

	private finalizeTransactionAmount(tx: Transaction): void {
		if (tx.useCalculatedAmount && tx.calculationLinks?.length) {
			tx.amount = computeLinkedAmount(tx.calculationLinks, this.data.transactions, tx.type);
		}
	}

	private getTransactionCurrency(tx: Transaction): string {
		return this.getAccount(tx.accountId)?.currency ?? this.getSettings().defaultCurrency;
	}

	private async syncNoteArtifacts(tx: Transaction, previousNotePath?: string): Promise<void> {
		const settings = this.getSettings();
		try {
			if (previousNotePath && previousNotePath !== tx.notePath) {
				await removeTransactionFromNote(this.app, { ...tx, notePath: previousNotePath });
			}
			await syncTransactionNote(this.app, this, tx, settings);
			await syncTransactionInNote(
				this.app,
				tx,
				this.getTransactionCurrency(tx),
				settings.dateFormat,
				settings.syncTransactionToLinkedNote,
				settings,
				this.getTransactions(),
			);
		} catch (error) {
			console.warn('[Finance] Synchronisation des notes ignorée', error);
		}
	}

	getData(): FinanceData {
		return this.data;
	}

	exportData(): string {
		return JSON.stringify(this.data, null, 2);
	}

	async importData(json: string, options: ImportDataOptions): Promise<ImportDataResult> {
		const parsed = migrateFinanceData(JSON.parse(json));
		validateAndRepairFinanceData(parsed);

		const result: ImportDataResult = {
			accounts: 0,
			categories: 0,
			transactions: 0,
			forecasts: 0,
			recurring: 0,
			budgets: 0,
		};

		if (options.mode === 'replace') {
			this.data = parsed;
		} else {
			const mergeById = <T extends { id: string }>(
				target: T[],
				source: T[],
				counter: keyof ImportDataResult,
			) => {
				for (const item of source) {
					if (!target.some(t => t.id === item.id)) {
						target.push(item);
						result[counter]++;
					}
				}
			};
			mergeById(this.data.accounts, parsed.accounts, 'accounts');
			mergeById(this.data.categories, parsed.categories, 'categories');
			mergeById(this.data.transactions, parsed.transactions, 'transactions');
			mergeById(this.data.forecasts, parsed.forecasts, 'forecasts');
			mergeById(this.data.recurring, parsed.recurring, 'recurring');
			mergeById(this.data.budgets, parsed.budgets, 'budgets');
		}

		if (options.mode === 'replace') {
			result.accounts = parsed.accounts.length;
			result.categories = parsed.categories.length;
			result.transactions = parsed.transactions.length;
			result.forecasts = parsed.forecasts.length;
			result.recurring = parsed.recurring.length;
			result.budgets = parsed.budgets.length;
		}

		this.recalculateDerived();
		await this.save();
		return result;
	}

	getAccounts(): Account[] {
		return [...this.data.accounts];
	}

	getCategories(): Category[] {
		return [...this.data.categories];
	}

	getTransactions(): Transaction[] {
		return [...this.data.transactions].sort((a, b) => b.date.localeCompare(a.date));
	}

	getForecasts(): Forecast[] {
		return [...this.data.forecasts];
	}

	getRecurring(): RecurringTransaction[] {
		return [...this.data.recurring];
	}

	getBudgets(): Budget[] {
		return [...this.data.budgets];
	}

	getAccount(id: string): Account | undefined {
		return this.data.accounts.find(a => a.id === id);
	}

	getTransaction(id: string): Transaction | undefined {
		return this.data.transactions.find(t => t.id === id);
	}

	async addAccount(account: Omit<Account, 'id' | 'createdAt'>): Promise<Account> {
		const newAccount: Account = syncAccountActualBalance({
			...account,
			id: generateId(),
			createdAt: new Date().toISOString(),
		});
		this.data.accounts.push(newAccount);
		await this.save();
		return newAccount;
	}

	async updateAccount(account: Account): Promise<void> {
		const idx = this.data.accounts.findIndex(a => a.id === account.id);
		if (idx >= 0) {
			this.data.accounts[idx] = syncAccountActualBalance(account);
			await this.save();
		}
	}

	async addBalanceSnapshot(
		accountId: string,
		snapshot: Omit<AccountBalanceSnapshot, 'id'>,
	): Promise<AccountBalanceSnapshot> {
		return this.upsertBalanceSnapshot(accountId, snapshot);
	}

	async upsertBalanceSnapshot(
		accountId: string,
		snapshot: Omit<AccountBalanceSnapshot, 'id'> & { id?: string },
	): Promise<AccountBalanceSnapshot> {
		const account = this.getAccount(accountId);
		if (!account) throw new Error('Compte introuvable');

		const item: AccountBalanceSnapshot = {
			...snapshot,
			id: snapshot.id ?? generateId(),
		};
		let snapshots = [...(account.balanceSnapshots ?? [])];
		const byId = snapshots.findIndex(s => s.id === item.id);
		if (byId >= 0) {
			snapshots[byId] = item;
		} else {
			const byDate = snapshots.findIndex(s => s.date === item.date);
			if (byDate >= 0) snapshots[byDate] = item;
			else snapshots.push(item);
		}
		snapshots = snapshots.sort((a, b) => a.date.localeCompare(b.date));

		await this.updateAccount({ ...account, balanceSnapshots: snapshots });
		return item;
	}

	async deleteBalanceSnapshot(accountId: string, snapshotId: string): Promise<void> {
		const account = this.getAccount(accountId);
		if (!account) return;

		const snapshots = (account.balanceSnapshots ?? []).filter(s => s.id !== snapshotId);
		await this.updateAccount({ ...account, balanceSnapshots: snapshots });
	}

	async deleteAccount(id: string): Promise<void> {
		this.data.accounts = this.data.accounts.filter(a => a.id !== id);
		this.data.categories = this.data.categories.filter(c => c.accountId !== id);
		this.data.transactions = this.data.transactions.filter(
			t => t.accountId !== id && t.transferToAccountId !== id,
		);
		this.data.forecasts = this.data.forecasts.filter(f => f.accountId !== id);
		this.data.recurring = this.data.recurring.filter(r => r.accountId !== id);
		this.data.budgets = this.data.budgets.filter(b => b.accountId !== id);
		await this.save();
	}

	async addCategory(category: Omit<Category, 'id'>): Promise<Category> {
		const newCategory: Category = { ...category, id: generateId() };
		this.data.categories.push(newCategory);
		await this.save();
		return newCategory;
	}

	async updateCategory(category: Category): Promise<void> {
		const idx = this.data.categories.findIndex(c => c.id === category.id);
		if (idx >= 0) {
			this.data.categories[idx] = category;
			await this.save();
		}
	}

	async deleteCategory(id: string): Promise<void> {
		this.data.categories = this.data.categories.filter(c => c.id !== id && c.parentId !== id);
		for (const tx of this.data.transactions) {
			if (tx.categoryId === id) tx.categoryId = undefined;
		}
		for (const f of this.data.forecasts) {
			if (f.categoryId === id) f.categoryId = undefined;
		}
		for (const r of this.data.recurring) {
			if (r.categoryId === id) r.categoryId = undefined;
		}
		this.data.budgets = this.data.budgets.filter(b => b.categoryId !== id);
		await this.save();
	}

	async addTransaction(transaction: Omit<Transaction, 'id'>): Promise<Transaction> {
		const newTx: Transaction = { ...transaction, id: generateId() };

		if (newTx.type === 'transfer' && newTx.transferToAccountId) {
			const linkedTx: Transaction = {
				id: generateId(),
				accountId: newTx.transferToAccountId,
				date: newTx.date,
				amount: Math.abs(newTx.amount),
				description: `Transfert depuis ${this.getAccount(newTx.accountId)?.name ?? 'compte'}`,
				tags: [...newTx.tags],
				type: 'transfer',
				transferToAccountId: newTx.accountId,
				linkedTransactionId: newTx.id,
				categoryId: newTx.categoryId,
			};
			newTx.amount = -Math.abs(newTx.amount);
			newTx.linkedTransactionId = linkedTx.id;
			this.data.transactions.push(newTx, linkedTx);
		} else {
			if (newTx.useCalculatedAmount && newTx.calculationLinks?.length) {
				this.finalizeTransactionAmount(newTx);
			} else if (newTx.useCalculatedAmount) {
				newTx.useCalculatedAmount = false;
				newTx.calculationLinks = undefined;
			} else {
				if (newTx.type === 'income') newTx.amount = Math.abs(newTx.amount);
				if (newTx.type === 'expense') newTx.amount = -Math.abs(newTx.amount);
			}
			this.data.transactions.push(newTx);
		}

		this.recalculateDerived();
		await this.save();
		await this.syncNoteArtifacts(newTx);
		if (newTx.linkedTransactionId) {
			const linked = this.getTransaction(newTx.linkedTransactionId);
			if (linked) await this.syncNoteArtifacts(linked);
		}
		return newTx;
	}

	async updateTransaction(transaction: Transaction): Promise<void> {
		const idx = this.data.transactions.findIndex(t => t.id === transaction.id);
		if (idx >= 0) {
			const previous = this.data.transactions[idx];
			this.finalizeTransactionAmount(transaction);
			this.data.transactions[idx] = transaction;
			this.recalculateDerived();
			await this.save();
			await this.syncNoteArtifacts(transaction, previous.notePath);
		}
	}

	async deleteTransaction(id: string): Promise<void> {
		const settings = this.getSettings();
		const tx = this.data.transactions.find(t => t.id === id);
		if (!tx) return;

		try {
			await deleteTransactionNote(this.app, tx, settings, this.data.transactions);
			if (tx.notePath) {
				await removeTransactionFromNote(this.app, tx);
			}
		} catch (error) {
			console.warn('[Finance] Nettoyage des notes ignoré lors de la suppression', error);
		}

		const linkedId = tx.linkedTransactionId;
		this.data.transactions = this.data.transactions.filter(
			t => t.id !== id && t.id !== linkedId,
		);
		this.recalculateDerived();
		await this.save();
	}

	async deleteTransactions(ids: string[]): Promise<number> {
		const unique = [...new Set(ids)];
		let deleted = 0;
		for (const id of unique) {
			if (!this.getTransaction(id)) continue;
			await this.deleteTransaction(id);
			deleted++;
		}
		return deleted;
	}

	async bulkUpdateCategory(ids: string[], categoryId: string | undefined): Promise<number> {
		let updated = 0;
		for (const id of ids) {
			const tx = this.getTransaction(id);
			if (!tx || tx.type === 'transfer') continue;
			await this.updateTransaction({ ...tx, categoryId });
			updated++;
		}
		return updated;
	}

	async createFromTransaction(
		sourceId: string,
		overrides: Partial<Omit<Transaction, 'id'>>,
	): Promise<Transaction> {
		const source = this.getTransaction(sourceId);
		if (!source) throw new Error('Transaction source introuvable');

		return this.addTransaction({
			accountId: overrides.accountId ?? source.accountId,
			date: overrides.date ?? source.date,
			amount: overrides.amount ?? source.amount,
			description: overrides.description ?? source.description,
			categoryId: overrides.categoryId ?? source.categoryId,
			tags: overrides.tags ?? [...source.tags],
			type: overrides.type ?? source.type,
			transferToAccountId: overrides.transferToAccountId ?? source.transferToAccountId,
			sourceTransactionId: sourceId,
		});
	}

	async addForecast(forecast: Omit<Forecast, 'id'>): Promise<Forecast> {
		const newForecast: Forecast = { ...forecast, id: generateId() };
		this.data.forecasts.push(newForecast);
		await this.save();
		return newForecast;
	}

	async updateForecast(forecast: Forecast): Promise<void> {
		const idx = this.data.forecasts.findIndex(f => f.id === forecast.id);
		if (idx >= 0) {
			this.data.forecasts[idx] = forecast;
			await this.save();
		}
	}

	async deleteForecast(id: string): Promise<void> {
		this.data.forecasts = this.data.forecasts.filter(f => f.id !== id);
		await this.save();
	}

	async addRecurring(recurring: Omit<RecurringTransaction, 'id'>): Promise<RecurringTransaction> {
		const item: RecurringTransaction = { ...recurring, id: generateId() };
		this.data.recurring.push(item);
		await this.save();
		return item;
	}

	async updateRecurring(recurring: RecurringTransaction): Promise<void> {
		const idx = this.data.recurring.findIndex(r => r.id === recurring.id);
		if (idx >= 0) {
			this.data.recurring[idx] = recurring;
			await this.save();
		}
	}

	async deleteRecurring(id: string): Promise<void> {
		this.data.recurring = this.data.recurring.filter(r => r.id !== id);
		await this.save();
	}

	async addBudget(budget: Omit<Budget, 'id'>): Promise<Budget> {
		const item: Budget = { ...budget, id: generateId() };
		this.data.budgets.push(item);
		await this.save();
		return item;
	}

	async updateBudget(budget: Budget): Promise<void> {
		const idx = this.data.budgets.findIndex(b => b.id === budget.id);
		if (idx >= 0) {
			this.data.budgets[idx] = budget;
			await this.save();
		}
	}

	async deleteBudget(id: string): Promise<void> {
		this.data.budgets = this.data.budgets.filter(b => b.id !== id);
		await this.save();
	}

	async processRecurringTransactions(): Promise<number> {
		const today = new Date().toISOString().slice(0, 10);
		let created = 0;

		for (const rec of this.data.recurring) {
			const dueDates = getRecurringDueDates(rec, rec.startDate, today);
			for (const date of dueDates) {
				const exists = this.data.transactions.some(
					t => t.recurringId === rec.id && t.date === date,
				);
				if (exists) continue;

				await this.addTransaction({
					accountId: rec.accountId,
					date,
					amount: rec.amount,
					description: rec.description,
					categoryId: rec.categoryId,
					tags: [...rec.tags],
					type: rec.type,
					recurringId: rec.id,
				});
				rec.lastGeneratedDate = date;
				created++;
			}
		}

		if (created > 0) await this.save();
		return created;
	}

	async resyncAllNoteArtifacts(): Promise<void> {
		for (const tx of this.data.transactions) {
			await this.syncNoteArtifacts(tx);
		}
	}
}

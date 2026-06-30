import type { FinanceData } from '../types';

export interface ValidationReport {
	repairedTransactions: number;
	repairedCategories: number;
	repairedForecasts: number;
	repairedRecurring: number;
	repairedBudgets: number;
	orphanWarnings: string[];
}

export function validateAndRepairFinanceData(data: FinanceData): ValidationReport {
	const report: ValidationReport = {
		repairedTransactions: 0,
		repairedCategories: 0,
		repairedForecasts: 0,
		repairedRecurring: 0,
		repairedBudgets: 0,
		orphanWarnings: [],
	};

	const accountIds = new Set(data.accounts.map(a => a.id));
	const categoryIds = new Set(data.categories.map(c => c.id));

	data.transactions = (data.transactions ?? []).filter(tx => {
		if (!accountIds.has(tx.accountId)) {
			report.repairedTransactions++;
			report.orphanWarnings.push(`Transaction supprimée (compte inconnu) : ${tx.description}`);
			return false;
		}
		if (tx.categoryId && !categoryIds.has(tx.categoryId)) {
			tx.categoryId = undefined;
			report.repairedTransactions++;
		}
		if (tx.transferToAccountId && !accountIds.has(tx.transferToAccountId)) {
			tx.transferToAccountId = undefined;
			report.repairedTransactions++;
		}
		if (tx.linkedTransactionId && !data.transactions.some(t => t.id === tx.linkedTransactionId)) {
			tx.linkedTransactionId = undefined;
			report.repairedTransactions++;
		}
		if (!Array.isArray(tx.tags)) tx.tags = [];
		return true;
	});

	for (const cat of data.categories ?? []) {
		if (cat.parentId && !categoryIds.has(cat.parentId)) {
			cat.parentId = undefined;
			report.repairedCategories++;
		}
		if (cat.accountId && !accountIds.has(cat.accountId)) {
			cat.accountId = undefined;
			report.repairedCategories++;
		}
	}

	data.forecasts = (data.forecasts ?? []).filter(f => {
		if (!accountIds.has(f.accountId)) {
			report.repairedForecasts++;
			return false;
		}
		if (f.categoryId && !categoryIds.has(f.categoryId)) f.categoryId = undefined;
		return true;
	});

	data.recurring = (data.recurring ?? []).filter(r => {
		if (!accountIds.has(r.accountId)) {
			report.repairedRecurring++;
			return false;
		}
		if (r.categoryId && !categoryIds.has(r.categoryId)) r.categoryId = undefined;
		if (!Array.isArray(r.tags)) r.tags = [];
		return true;
	});

	data.budgets = (data.budgets ?? []).filter(b => {
		if (!categoryIds.has(b.categoryId)) {
			report.repairedBudgets++;
			return false;
		}
		if (b.accountId && !accountIds.has(b.accountId)) b.accountId = undefined;
		return true;
	});

	return report;
}

import type { Budget, Category, Transaction } from '../types';
import { getMonthKey } from './monthly';

export interface BudgetStatus {
	budget: Budget;
	categoryName: string;
	spent: number;
	remaining: number;
	percentage: number;
	overBudget: boolean;
}

export function getBudgetStatusForMonth(
	budgets: Budget[],
	transactions: Transaction[],
	categories: Category[],
	monthKey: string,
	accountId?: string | null,
): BudgetStatus[] {
	const monthTx = transactions.filter(t => {
		if (getMonthKey(t.date) !== monthKey) return false;
		if (accountId && t.accountId !== accountId) return false;
		if (t.type === 'transfer' || t.amount >= 0) return false;
		return true;
	});

	return budgets
		.filter(b => !accountId || !b.accountId || b.accountId === accountId)
		.map(budget => {
			const spent = monthTx
				.filter(t => t.categoryId === budget.categoryId)
				.reduce((s, t) => s + Math.abs(t.amount), 0);
			const category = categories.find(c => c.id === budget.categoryId);
			const remaining = budget.amount - spent;
			const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
			return {
				budget,
				categoryName: category?.name ?? '—',
				spent,
				remaining,
				percentage,
				overBudget: spent > budget.amount,
			};
		});
}

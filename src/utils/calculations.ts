import type { Account, Category, Forecast, Transaction } from '../types';

export function getAccountBalance(accountId: string, transactions: Transaction[], initialBalance: number): number {
	let balance = initialBalance;
	for (const tx of transactions) {
		if (tx.accountId === accountId) {
			balance += tx.amount;
		}
		if (tx.type === 'transfer' && tx.transferToAccountId === accountId) {
			balance += Math.abs(tx.amount);
		}
	}
	return balance;
}

export interface CategoryBreakdown {
	categoryId: string | null;
	categoryName: string;
	color: string;
	total: number;
	percentage: number;
}

export function getCategoryBreakdown(
	accountId: string,
	transactions: Transaction[],
	categories: Category[],
	direction: 'expense' | 'income' = 'expense',
): CategoryBreakdown[] {
	const isExpense = direction === 'expense';
	const filtered = transactions.filter(
		t => t.accountId === accountId && t.type !== 'transfer' && (isExpense ? t.amount < 0 : t.amount > 0),
	);
	const total = filtered.reduce((sum, t) => sum + Math.abs(t.amount), 0);
	if (total === 0) return [];

	const byCategory = new Map<string | null, number>();
	for (const tx of filtered) {
		const key = tx.categoryId ?? null;
		byCategory.set(key, (byCategory.get(key) ?? 0) + Math.abs(tx.amount));
	}

	const result: CategoryBreakdown[] = [];
	for (const [categoryId, catTotal] of byCategory) {
		const category = categoryId ? categories.find(c => c.id === categoryId) : undefined;
		result.push({
			categoryId,
			categoryName: category?.name ?? 'Sans catégorie',
			color: category?.color ?? '#888888',
			total: catTotal,
			percentage: (catTotal / total) * 100,
		});
	}
	return result.sort((a, b) => b.total - a.total);
}

export interface MonthlyFlowPoint {
	month: string;
	income: number;
	expense: number;
}

export function getMonthlyIncomeExpense(
	accountId: string,
	transactions: Transaction[],
): MonthlyFlowPoint[] {
	const byMonth = new Map<string, MonthlyFlowPoint>();
	for (const tx of transactions) {
		if (tx.accountId !== accountId || tx.type === 'transfer') continue;
		const month = tx.date.slice(0, 7);
		const point = byMonth.get(month) ?? { month, income: 0, expense: 0 };
		if (tx.amount > 0) point.income += tx.amount;
		else point.expense += Math.abs(tx.amount);
		byMonth.set(month, point);
	}
	return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export interface BalancePoint {
	date: string;
	balance: number;
}

export function getBalanceHistory(
	accountId: string,
	transactions: Transaction[],
	initialBalance: number,
): BalancePoint[] {
	const accountTx = transactions
		.filter(t => t.accountId === accountId || t.transferToAccountId === accountId)
		.map(t => {
			let delta = 0;
			if (t.accountId === accountId) delta += t.amount;
			if (t.type === 'transfer' && t.transferToAccountId === accountId) {
				delta += Math.abs(t.amount);
			}
			return { date: t.date, delta };
		})
		.sort((a, b) => a.date.localeCompare(b.date));

	const points: BalancePoint[] = [];
	let balance = initialBalance;
	for (const { date, delta } of accountTx) {
		balance += delta;
		points.push({ date, balance });
	}
	return points;
}

export interface ForecastOccurrence {
	date: string;
	amount: number;
	description: string;
	forecastId: string;
}

export function getForecastOccurrences(
	forecasts: Forecast[],
	fromDate: string,
	toDate: string,
): ForecastOccurrence[] {
	const occurrences: ForecastOccurrence[] = [];
	const from = new Date(fromDate);
	const to = new Date(toDate);

	for (const forecast of forecasts) {
		const start = new Date(forecast.startDate);
		const end = forecast.endDate ? new Date(forecast.endDate) : to;
		let current = new Date(Math.max(start.getTime(), from.getTime()));

		while (current <= to && current <= end) {
			if (current >= from) {
				occurrences.push({
					date: current.toISOString().slice(0, 10),
					amount: forecast.amount,
					description: forecast.description,
					forecastId: forecast.id,
				});
			}

			switch (forecast.frequency) {
				case 'once':
					current = new Date(to.getTime() + 1);
					break;
				case 'weekly':
					current.setDate(current.getDate() + 7);
					break;
				case 'monthly':
					current.setMonth(current.getMonth() + 1);
					break;
				case 'yearly':
					current.setFullYear(current.getFullYear() + 1);
					break;
			}
		}
	}
	return occurrences.sort((a, b) => a.date.localeCompare(b.date));
}

export function getProjectedBalance(
	account: Account,
	transactions: Transaction[],
	forecasts: Forecast[],
	toDate: string,
): number {
	const currentBalance = getAccountBalance(account.id, transactions, account.initialBalance);
	const accountForecasts = forecasts.filter(f => f.accountId === account.id);
	const today = new Date().toISOString().slice(0, 10);
	const occurrences = getForecastOccurrences(accountForecasts, today, toDate);
	return currentBalance + occurrences.reduce((sum, o) => sum + o.amount, 0);
}

export function getAllTags(transactions: Transaction[]): string[] {
	const tags = new Set<string>();
	for (const tx of transactions) {
		for (const tag of tx.tags) {
			tags.add(tag);
		}
	}
	return Array.from(tags).sort();
}

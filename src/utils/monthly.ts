import type { Transaction } from '../types';

export function getMonthKey(dateStr: string): string {
	return dateStr.slice(0, 7);
}

export function formatMonthLabel(monthKey: string, locale = 'fr-FR'): string {
	const [year, month] = monthKey.split('-').map(Number);
	const date = new Date(year, month - 1, 1);
	return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export interface MonthSummary {
	income: number;
	expenses: number;
	net: number;
	count: number;
}

export function summarizeMonthTransactions(transactions: Transaction[]): MonthSummary {
	let income = 0;
	let expenses = 0;
	for (const tx of transactions) {
		if (tx.type === 'transfer') continue;
		if (tx.amount > 0) income += tx.amount;
		else expenses += Math.abs(tx.amount);
	}
	return {
		income,
		expenses,
		net: income - expenses,
		count: transactions.length,
	};
}

export function getAccountTransactionsByMonth(
	accountId: string,
	transactions: Transaction[],
): Map<string, Transaction[]> {
	const byMonth = new Map<string, Transaction[]>();

	for (const tx of transactions) {
		if (tx.accountId !== accountId && tx.transferToAccountId !== accountId) continue;
		const key = getMonthKey(tx.date);
		if (!byMonth.has(key)) byMonth.set(key, []);
		byMonth.get(key)!.push(tx);
	}

	for (const [key, txs] of byMonth) {
		txs.sort((a, b) => b.date.localeCompare(a.date));
		byMonth.set(key, txs);
	}

	return byMonth;
}

export function getSortedMonthKeys(byMonth: Map<string, Transaction[]>): string[] {
	return Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
}

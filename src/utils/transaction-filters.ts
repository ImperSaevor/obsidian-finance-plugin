import type { Category, Transaction, TransactionType } from '../types';
import { formatMonthLabel } from './monthly';

export type SortField = 'date' | 'amount' | 'description' | 'category' | 'type';
export type SortDirection = 'asc' | 'desc';
export type GroupBy = 'none' | 'month' | 'day' | 'category' | 'type' | 'amount_sign';

export interface TransactionFilterState {
	search: string;
	type: TransactionType | '';
	categoryId: string;
	tag: string;
	dateFrom: string;
	dateTo: string;
	sortField: SortField;
	sortDirection: SortDirection;
	groupBy: GroupBy;
	collapseGroups: boolean;
}

export const DEFAULT_TX_FILTER: TransactionFilterState = {
	search: '',
	type: '',
	categoryId: '',
	tag: '',
	dateFrom: '',
	dateTo: '',
	sortField: 'date',
	sortDirection: 'desc',
	groupBy: 'none',
	collapseGroups: false,
};

export function hasActiveFilters(filter: TransactionFilterState): boolean {
	return Boolean(
		filter.search
		|| filter.type
		|| filter.categoryId
		|| filter.tag
		|| filter.dateFrom
		|| filter.dateTo
		|| filter.groupBy !== 'none'
		|| filter.collapseGroups,
	);
}

export function countActiveFilters(filter: TransactionFilterState): number {
	let n = 0;
	if (filter.search) n++;
	if (filter.type) n++;
	if (filter.categoryId) n++;
	if (filter.tag) n++;
	if (filter.dateFrom) n++;
	if (filter.dateTo) n++;
	if (filter.groupBy !== 'none') n++;
	return n;
}

export function filterTransactions(
	transactions: Transaction[],
	filter: TransactionFilterState,
	categories: Category[],
): Transaction[] {
	return transactions.filter(tx => {
		if (filter.type && tx.type !== filter.type) return false;
		if (filter.categoryId && tx.categoryId !== filter.categoryId) return false;
		if (filter.tag && !tx.tags.includes(filter.tag)) return false;
		if (filter.dateFrom && tx.date < filter.dateFrom) return false;
		if (filter.dateTo && tx.date > filter.dateTo) return false;
		if (filter.search) {
			const q = filter.search.toLowerCase();
			const cat = categories.find(c => c.id === tx.categoryId);
			const noteName = tx.notePath
				? tx.notePath.split('/').pop()?.replace(/\.md$/i, '') ?? ''
				: '';
			const haystack = [
				tx.description,
				cat?.name ?? '',
				noteName,
				...tx.tags,
			].join(' ').toLowerCase();
			if (!haystack.includes(q)) return false;
		}
		return true;
	});
}

function sortValue(
	tx: Transaction,
	field: SortField,
	categories: Category[],
): string | number {
	switch (field) {
		case 'date': return tx.date;
		case 'amount': return tx.amount;
		case 'description': return tx.description.toLowerCase();
		case 'type': return tx.type;
		case 'category': {
			const cat = categories.find(c => c.id === tx.categoryId);
			return cat?.name.toLowerCase() ?? 'zzz';
		}
	}
}

export function sortTransactions(
	transactions: Transaction[],
	filter: TransactionFilterState,
	categories: Category[],
): Transaction[] {
	const sorted = [...transactions];
	const dir = filter.sortDirection === 'asc' ? 1 : -1;
	sorted.sort((a, b) => {
		const va = sortValue(a, filter.sortField, categories);
		const vb = sortValue(b, filter.sortField, categories);
		if (va < vb) return -dir;
		if (va > vb) return dir;
		return b.date.localeCompare(a.date);
	});
	return sorted;
}

export function applyFiltersAndSort(
	transactions: Transaction[],
	filter: TransactionFilterState,
	categories: Category[],
): Transaction[] {
	return sortTransactions(filterTransactions(transactions, filter, categories), filter, categories);
}

export interface TransactionGroup {
	key: string;
	label: string;
	transactions: Transaction[];
	total: number;
}

export function groupTransactions(
	transactions: Transaction[],
	groupBy: GroupBy,
	categories: Category[],
	locale: string,
): TransactionGroup[] {
	if (groupBy === 'none') {
		return [{
			key: 'all',
			label: 'Toutes',
			transactions,
			total: transactions.reduce((s, t) => s + t.amount, 0),
		}];
	}

	const map = new Map<string, Transaction[]>();
	for (const tx of transactions) {
		const key = getGroupKey(tx, groupBy);
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(tx);
	}

	const groups: TransactionGroup[] = [];
	for (const [key, txs] of map) {
		groups.push({
			key,
			label: getGroupLabel(key, groupBy, categories, locale),
			transactions: txs,
			total: txs.reduce((s, t) => s + t.amount, 0),
		});
	}

	groups.sort((a, b) => {
		if (groupBy === 'month' || groupBy === 'day') return b.key.localeCompare(a.key);
		return a.label.localeCompare(b.label, locale);
	});

	return groups;
}

function getGroupKey(tx: Transaction, groupBy: GroupBy): string {
	switch (groupBy) {
		case 'month': return tx.date.slice(0, 7);
		case 'day': return tx.date;
		case 'category': return tx.categoryId ?? '__none__';
		case 'type': return tx.type;
		case 'amount_sign':
			if (tx.type === 'transfer') return 'transfer';
			return tx.amount >= 0 ? 'income' : 'expense';
		default: return 'all';
	}
}

function getGroupLabel(
	key: string,
	groupBy: GroupBy,
	categories: Category[],
	locale: string,
): string {
	switch (groupBy) {
		case 'month':
			return formatMonthLabel(key, locale).replace(/^\w/, c => c.toUpperCase());
		case 'day':
			return key;
		case 'category':
			if (key === '__none__') return 'Sans catégorie';
			return categories.find(c => c.id === key)?.name ?? key;
		case 'type':
		case 'amount_sign':
			return ({ income: 'Revenus', expense: 'Dépenses', transfer: 'Transferts' } as Record<string, string>)[key] ?? key;
		default:
			return key;
	}
}

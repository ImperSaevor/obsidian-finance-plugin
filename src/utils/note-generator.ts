import type { FinanceStore } from '../store/finance-store';
import type { FinancePluginSettings } from '../settings';
import type { Account } from '../types';
import { getAccountBalance, getCategoryBreakdown } from './calculations';
import { getCategoriesForAccount } from './categories';
import { formatCurrency, formatDate } from './format';
import { notePathToWikilink } from './note-links';

export function generateFinanceNote(
	store: FinanceStore,
	settings: FinancePluginSettings,
	accountId: string | null,
): string {
	const accounts = accountId
		? store.getAccounts().filter(a => a.id === accountId)
		: store.getAccounts();
	const transactions = store.getTransactions();
	const categories = store.getCategories();
	const lines: string[] = ['# Rapport financier', ''];

	if (accounts.length === 0) {
		lines.push('_Aucun compte._');
		return lines.join('\n');
	}

	const now = new Date();
	const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

	let totalBalance = 0;
	for (const account of accounts) {
		totalBalance += getAccountBalance(account.id, transactions, account.initialBalance);
	}

	if (!accountId) {
		lines.push(`**Solde total :** ${formatCurrency(totalBalance, settings.defaultCurrency, settings.dateFormat)}`, '');
	}

	for (const account of accounts) {
		lines.push(...generateAccountSection(account, settings, transactions, categories, monthStart));
	}

	return lines.join('\n');
}

function generateAccountSection(
	account: Account,
	settings: FinancePluginSettings,
	transactions: ReturnType<FinanceStore['getTransactions']>,
	categories: ReturnType<FinanceStore['getCategories']>,
	monthStart: string,
): string[] {
	const balance = getAccountBalance(account.id, transactions, account.initialBalance);
	const accountTx = transactions.filter(t => t.accountId === account.id);
	const monthTx = accountTx.filter(t => t.date >= monthStart);
	const income = monthTx.filter(t => t.amount > 0 && t.type !== 'transfer').reduce((s, t) => s + t.amount, 0);
	const expenses = monthTx.filter(t => t.amount < 0 && t.type !== 'transfer').reduce((s, t) => s + Math.abs(t.amount), 0);
	const accountCategories = getCategoriesForAccount(categories, account.id);
	const breakdown = getCategoryBreakdown(account.id, transactions, accountCategories);

	const lines: string[] = [
		`## ${account.name}`,
		'',
		`| Indicateur | Montant |`,
		`| --- | --- |`,
		`| Solde | ${formatCurrency(balance, account.currency, settings.dateFormat)} |`,
		`| Revenus (mois) | ${formatCurrency(income, account.currency, settings.dateFormat)} |`,
		`| Dépenses (mois) | ${formatCurrency(expenses, account.currency, settings.dateFormat)} |`,
		'',
	];

	if (breakdown.length > 0) {
		lines.push('### Dépenses par catégorie', '');
		for (const item of breakdown) {
			lines.push(`- **${item.categoryName}** : ${formatCurrency(item.total, account.currency, settings.dateFormat)} (${item.percentage.toFixed(1)}%)`);
		}
		lines.push('');
	}

	const recent = accountTx.slice(0, 10);
	if (recent.length > 0) {
		lines.push('### Transactions récentes', '');
		lines.push('| Date | Description | Montant | Note |');
		lines.push('| --- | --- | --- | --- |');
		for (const tx of recent) {
			const cat = categories.find(c => c.id === tx.categoryId);
			const desc = cat ? `${tx.description} _(${cat.name})_` : tx.description;
			const note = tx.notePath ? notePathToWikilink(tx.notePath) : '—';
			lines.push(`| ${formatDate(tx.date, settings.dateFormat)} | ${desc} | ${formatCurrency(tx.amount, account.currency, settings.dateFormat)} | ${note} |`);
		}
		lines.push('');
	}

	return lines;
}

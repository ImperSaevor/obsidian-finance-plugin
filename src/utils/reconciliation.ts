import type { Account, AccountBalanceSnapshot, Transaction } from '../types';
import { getAccountBalance, getBalanceHistory } from './calculations';
import { generateId } from './id';

export const RECONCILE_EPSILON = 0.005;

export function normalizeAccountSnapshots(account: Account): AccountBalanceSnapshot[] {
	const snaps = [...(account.balanceSnapshots ?? [])].sort((a, b) => a.date.localeCompare(b.date));
	if (snaps.length > 0) return snaps;
	if (account.actualBalance !== undefined && Number.isFinite(account.actualBalance)) {
		return [{
			id: 'legacy-actual',
			date: new Date().toISOString().slice(0, 10),
			actualBalance: account.actualBalance,
			note: 'Migré depuis le solde réel unique',
		}];
	}
	return [];
}

export function getLatestAccountSnapshot(account: Account): AccountBalanceSnapshot | undefined {
	const snaps = normalizeAccountSnapshots(account);
	return snaps.length > 0 ? snaps[snaps.length - 1] : undefined;
}

export function syncAccountActualBalance(account: Account): Account {
	const latest = getLatestAccountSnapshot(account);
	return {
		...account,
		balanceSnapshots: account.balanceSnapshots ?? normalizeAccountSnapshots(account),
		actualBalance: latest?.actualBalance,
	};
}

export function getAccountBalanceAtDate(
	accountId: string,
	transactions: Transaction[],
	initialBalance: number,
	asOfDate: string,
): number {
	let balance = initialBalance;
	for (const tx of transactions) {
		if (tx.date > asOfDate) continue;
		if (tx.accountId === accountId) balance += tx.amount;
		if (tx.type === 'transfer' && tx.transferToAccountId === accountId) {
			balance += Math.abs(tx.amount);
		}
	}
	return balance;
}

export interface ReconciliationChartPoint {
	date: string;
	calculated: number;
	actual?: number;
	delta?: number;
}

export function getReconciliationChartSeries(
	account: Account,
	transactions: Transaction[],
): ReconciliationChartPoint[] {
	const snapshots = normalizeAccountSnapshots(account);
	const history = getBalanceHistory(account.id, transactions, account.initialBalance);
	const dateSet = new Set<string>();

	if (account.createdAt) dateSet.add(account.createdAt.slice(0, 10));
	for (const point of history) dateSet.add(point.date);
	for (const snap of snapshots) dateSet.add(snap.date);

	const accountTx = transactions.filter(
		t => t.accountId === account.id || t.transferToAccountId === account.id,
	);
	if (accountTx.length > 0) {
		dateSet.add(accountTx[accountTx.length - 1].date);
	}
	dateSet.add(new Date().toISOString().slice(0, 10));

	const snapByDate = new Map(snapshots.map(s => [s.date, s.actualBalance]));

	return [...dateSet].sort().map(date => {
		const calculated = getAccountBalanceAtDate(
			account.id,
			transactions,
			account.initialBalance,
			date,
		);
		const actual = snapByDate.get(date);
		return {
			date,
			calculated,
			actual,
			delta: actual !== undefined ? actual - calculated : undefined,
		};
	});
}

export type ReconciliationFindingSeverity = 'info' | 'warning' | 'error';

export interface ReconciliationFinding {
	id: string;
	severity: ReconciliationFindingSeverity;
	title: string;
	description: string;
	amount?: number;
	transactionIds?: string[];
	date?: string;
}

export interface ReconciliationAnalysis {
	findings: ReconciliationFinding[];
	snapshots: AccountBalanceSnapshot[];
	currentCalculated: number;
	currentActual?: number;
	currentDelta?: number;
	isReconciled: boolean;
}

function getAccountTransactions(accountId: string, transactions: Transaction[]): Transaction[] {
	return transactions.filter(
		t => t.accountId === accountId || t.transferToAccountId === accountId,
	);
}

function findPotentialDuplicateGroups(transactions: Transaction[]): Transaction[][] {
	const groups: Transaction[][] = [];
	const seen = new Set<string>();

	for (let i = 0; i < transactions.length; i++) {
		if (seen.has(transactions[i].id)) continue;
		const a = transactions[i];
		const group = [a];

		for (let j = i + 1; j < transactions.length; j++) {
			const b = transactions[j];
			if (a.date !== b.date) continue;
			if (Math.abs(Math.abs(a.amount) - Math.abs(b.amount)) > RECONCILE_EPSILON) continue;
			const descA = a.description.trim().toLowerCase();
			const descB = b.description.trim().toLowerCase();
			if (descA === descB || descA.includes(descB) || descB.includes(descA)) {
				group.push(b);
			}
		}

		if (group.length > 1) {
			for (const tx of group) seen.add(tx.id);
			groups.push(group);
		}
	}

	return groups;
}

export function analyzeReconciliationGaps(
	account: Account,
	transactions: Transaction[],
): ReconciliationAnalysis {
	const findings: ReconciliationFinding[] = [];
	const snapshots = normalizeAccountSnapshots(account);
	const accountTx = getAccountTransactions(account.id, transactions);
	const today = new Date().toISOString().slice(0, 10);
	const currentCalculated = getAccountBalance(account.id, transactions, account.initialBalance);
	const latest = snapshots[snapshots.length - 1];
	const currentActual = latest?.actualBalance;
	const currentDelta = currentActual !== undefined ? currentActual - currentCalculated : undefined;
	const isReconciled = currentDelta !== undefined && Math.abs(currentDelta) < RECONCILE_EPSILON;

	if (snapshots.length === 0) {
		findings.push({
			id: generateId(),
			severity: 'info',
			title: 'Aucun solde réel saisi',
			description: 'Ajoutez des points de solde réel (date + montant du relevé) pour comparer avec le calcul du plugin et analyser les écarts.',
		});
		return {
			findings,
			snapshots,
			currentCalculated,
			currentActual,
			currentDelta,
			isReconciled: false,
		};
	}

	for (const snap of snapshots) {
		const calculated = getAccountBalanceAtDate(
			account.id,
			transactions,
			account.initialBalance,
			snap.date,
		);
		const delta = snap.actualBalance - calculated;
		if (Math.abs(delta) < RECONCILE_EPSILON) continue;

		findings.push({
			id: generateId(),
			severity: 'warning',
			title: `Écart au ${snap.date}`,
			description: delta > 0
				? `Le relevé indique un solde supérieur de ${Math.abs(delta).toFixed(2)} au calcul du plugin à cette date.`
				: `Le relevé indique un solde inférieur de ${Math.abs(delta).toFixed(2)} au calcul du plugin à cette date.`,
			amount: delta,
			date: snap.date,
		});

		if (delta > 0) {
			findings.push({
				id: generateId(),
				severity: 'info',
				title: 'Piste : revenu ou crédit manquant',
				description: `À la date du ${snap.date}, il manquerait environ ${delta.toFixed(2)} de revenu (ou une dépense en trop est enregistrée dans le plugin).`,
				amount: delta,
				date: snap.date,
			});
		} else {
			findings.push({
				id: generateId(),
				severity: 'info',
				title: 'Piste : dépense ou débit manquant',
				description: `À la date du ${snap.date}, il manquerait environ ${Math.abs(delta).toFixed(2)} de dépense (ou un revenu en trop est enregistré dans le plugin).`,
				amount: delta,
				date: snap.date,
			});
		}
	}

	for (let i = 1; i < snapshots.length; i++) {
		const prev = snapshots[i - 1];
		const curr = snapshots[i];
		const actualDelta = curr.actualBalance - prev.actualBalance;
		const calcDelta = getAccountBalanceAtDate(account.id, transactions, account.initialBalance, curr.date)
			- getAccountBalanceAtDate(account.id, transactions, account.initialBalance, prev.date);
		const unexplained = actualDelta - calcDelta;

		if (Math.abs(unexplained) < RECONCILE_EPSILON) continue;

		const periodTx = accountTx.filter(
			t => t.accountId === account.id && t.date > prev.date && t.date <= curr.date,
		);

		findings.push({
			id: generateId(),
			severity: 'warning',
			title: `Variation inexpliquée du ${prev.date} au ${curr.date}`,
			description: `Sur le relevé : ${actualDelta.toFixed(2)}, enregistré dans le plugin : ${calcDelta.toFixed(2)}. Écart non couvert : ${unexplained.toFixed(2)} (${periodTx.length} transaction(s) sur la période).`,
			amount: unexplained,
			date: curr.date,
			transactionIds: periodTx.map(t => t.id),
		});
	}

	if (snapshots.length >= 2) {
		const deltas = snapshots.map(
			s => s.actualBalance - getAccountBalanceAtDate(
				account.id,
				transactions,
				account.initialBalance,
				s.date,
			),
		);
		const first = deltas[0];
		if (Math.abs(first) >= RECONCILE_EPSILON && deltas.every(d => Math.abs(d - first) < RECONCILE_EPSILON)) {
			findings.push({
				id: generateId(),
				severity: 'warning',
				title: 'Écart constant sur toutes les dates',
				description: `L'écart reste stable (~${first.toFixed(2)}). Le solde initial du compte est probablement incorrect.`,
				amount: first,
			});
		}
	}

	if (latest && latest.date < today) {
		const txAfter = accountTx.filter(
			t => t.accountId === account.id && t.date > latest.date,
		);
		if (txAfter.length > 0) {
			const sumAfter = txAfter.reduce((s, t) => s + t.amount, 0);
			findings.push({
				id: generateId(),
				severity: 'info',
				title: `${txAfter.length} transaction(s) après la dernière saisie réelle`,
				description: `Depuis le ${latest.date}, le plugin a enregistré ${sumAfter.toFixed(2)} d'évolution. Mettez à jour le solde réel à aujourd'hui pour une comparaison à jour.`,
				date: today,
				transactionIds: txAfter.map(t => t.id),
				amount: sumAfter,
			});
		}
	}

	const uncategorized = accountTx.filter(t => t.accountId === account.id && !t.categoryId && t.type !== 'transfer');
	if (uncategorized.length > 0) {
		findings.push({
			id: generateId(),
			severity: 'info',
			title: `${uncategorized.length} transaction(s) sans catégorie`,
			description: 'Des opérations non classées peuvent indiquer des imports ou saisies à vérifier.',
			transactionIds: uncategorized.slice(0, 20).map(t => t.id),
		});
	}

	const calculatedTx = accountTx.filter(t => t.useCalculatedAmount);
	if (calculatedTx.length > 0) {
		findings.push({
			id: generateId(),
			severity: 'info',
			title: `${calculatedTx.length} transaction(s) à montant calculé`,
			description: 'Les montants calculés automatiquement peuvent diverger du relevé si les liens sont incomplets.',
			transactionIds: calculatedTx.map(t => t.id),
		});
	}

	for (const group of findPotentialDuplicateGroups(accountTx.filter(t => t.accountId === account.id))) {
		findings.push({
			id: generateId(),
			severity: 'warning',
			title: 'Doublons potentiels',
			description: `${group.length} transactions similaires le ${group[0].date} (« ${group[0].description} »).`,
			date: group[0].date,
			transactionIds: group.map(t => t.id),
		});
	}

	return {
		findings,
		snapshots,
		currentCalculated,
		currentActual,
		currentDelta,
		isReconciled,
	};
}

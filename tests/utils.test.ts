import { describe, expect, it } from 'vitest';
import { parseCsvTransactions } from '../src/utils/csv-import';
import { assignDistinctColors } from '../src/charts/chart-utils';
import { getRecurringDueDates } from '../src/utils/recurring';
import { validateAndRepairFinanceData } from '../src/utils/data-validation';
import { EMPTY_FINANCE_DATA } from '../src/types';
import { sanitizeNoteBaseName } from '../src/utils/note-names';
import { getAccountBalanceReconciliation } from '../src/utils/calculations';
import { analyzeReconciliationGaps } from '../src/utils/reconciliation';

describe('parseCsvTransactions', () => {
	it('parse une ligne CSV standard', () => {
		const csv = 'date,description,montant\n2024-06-15,Courses,-42.50';
		const { rows, errors } = parseCsvTransactions(csv);
		expect(errors).toHaveLength(0);
		expect(rows).toHaveLength(1);
		expect(rows[0].description).toBe('Courses');
		expect(rows[0].amount).toBe(-42.5);
	});
});

describe('assignDistinctColors', () => {
	it('évite les doublons', () => {
		const colors = assignDistinctColors(['#4a9eff', '#4a9eff', '#888']);
		expect(colors[0]).toBe('#4a9eff');
		expect(colors[1]).not.toBe(colors[0]);
	});
});

describe('getRecurringDueDates', () => {
	it('limite la première génération à une date', () => {
		const dates = getRecurringDueDates({
			id: '1',
			accountId: 'a',
			description: 'Loyer',
			amount: -800,
			type: 'expense',
			frequency: 'monthly',
			startDate: '2020-01-01',
			tags: [],
		}, '2020-01-01', '2024-06-15');
		expect(dates).toHaveLength(1);
	});
});

describe('validateAndRepairFinanceData', () => {
	it('supprime les transactions orphelines', () => {
		const data = {
			...EMPTY_FINANCE_DATA,
			accounts: [{ id: 'a1', name: 'Test', type: 'checking' as const, currency: 'EUR', initialBalance: 0, color: '#000', createdAt: '' }],
			transactions: [{
				id: 't1', accountId: 'missing', date: '2024-01-01', amount: -10,
				description: 'x', tags: [], type: 'expense' as const,
			}],
		};
		const report = validateAndRepairFinanceData(data);
		expect(data.transactions).toHaveLength(0);
		expect(report.repairedTransactions).toBe(1);
	});
});

describe('sanitizeNoteBaseName', () => {
	it('nettoie les caractères invalides', () => {
		expect(sanitizeNoteBaseName('Courses / super')).toBe('Courses - super');
	});
});

describe('getAccountBalanceReconciliation', () => {
	it('calcule l\'écart entre réel et calculé', () => {
		const account = {
			id: 'a1',
			name: 'Courant',
			type: 'checking' as const,
			currency: 'EUR',
			initialBalance: 100,
			balanceSnapshots: [{
				id: 's1',
				date: '2024-06-01',
				actualBalance: 150,
			}],
			color: '#000',
			createdAt: '',
		};
		const transactions = [{
			id: 't1', accountId: 'a1', date: '2024-01-01', amount: -20,
			description: 'x', tags: [], type: 'expense' as const,
		}];
		const rec = getAccountBalanceReconciliation(account, transactions);
		expect(rec.calculated).toBe(80);
		expect(rec.actual).toBe(150);
		expect(rec.delta).toBe(70);
		expect(rec.isReconciled).toBe(false);
	});
});

describe('analyzeReconciliationGaps', () => {
	it('détecte un écart et une piste', () => {
		const account = {
			id: 'a1',
			name: 'Courant',
			type: 'checking' as const,
			currency: 'EUR',
			initialBalance: 0,
			balanceSnapshots: [{ id: 's1', date: '2024-06-15', actualBalance: 100 }],
			color: '#000',
			createdAt: '',
		};
		const transactions = [{
			id: 't1', accountId: 'a1', date: '2024-06-10', amount: 50,
			description: 'Salaire', tags: [], type: 'income' as const,
		}];
		const analysis = analyzeReconciliationGaps(account, transactions);
		expect(analysis.currentDelta).toBe(50);
		expect(analysis.findings.some(f => f.title.includes('Écart au'))).toBe(true);
	});
});

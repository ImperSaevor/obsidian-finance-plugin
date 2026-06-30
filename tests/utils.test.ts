import { describe, expect, it } from 'vitest';
import { parseCsvTransactions } from '../src/utils/csv-import';
import { assignDistinctColors } from '../src/charts/chart-utils';
import { getRecurringDueDates } from '../src/utils/recurring';
import { validateAndRepairFinanceData } from '../src/utils/data-validation';
import { EMPTY_FINANCE_DATA } from '../src/types';
import { sanitizeNoteBaseName } from '../src/utils/note-names';

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

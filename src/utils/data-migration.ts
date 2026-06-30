import type { FinanceData } from '../types';
import { EMPTY_FINANCE_DATA } from '../types';

export const CURRENT_DATA_VERSION = 2;

export function migrateFinanceData(raw: unknown): FinanceData {
	const base = { ...EMPTY_FINANCE_DATA, ...(typeof raw === 'object' && raw !== null ? raw as Partial<FinanceData> : {}) };
	const version = (raw as { dataVersion?: number })?.dataVersion ?? 1;

	if (version < 2) {
		base.dataVersion = 2;
		if (!base.recurring) base.recurring = [];
		if (!base.budgets) base.budgets = [];
	}

	base.dataVersion = CURRENT_DATA_VERSION;
	return base;
}

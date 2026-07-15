import type { FinanceData } from '../types';
import { EMPTY_FINANCE_DATA } from '../types';
import { generateId } from './id';
import { syncAccountActualBalance } from './reconciliation';

export const CURRENT_DATA_VERSION = 3;

export function migrateFinanceData(raw: unknown): FinanceData {
	const base = { ...EMPTY_FINANCE_DATA, ...(typeof raw === 'object' && raw !== null ? raw as Partial<FinanceData> : {}) };
	const version = (raw as { dataVersion?: number })?.dataVersion ?? 1;

	if (version < 2) {
		if (!base.recurring) base.recurring = [];
		if (!base.budgets) base.budgets = [];
	}

	if (version < 3) {
		base.accounts = (base.accounts ?? []).map(account => {
			const synced = syncAccountActualBalance(account);
			if (!synced.balanceSnapshots?.length && synced.actualBalance !== undefined) {
				return {
					...synced,
					balanceSnapshots: [{
						id: generateId(),
						date: new Date().toISOString().slice(0, 10),
						actualBalance: synced.actualBalance,
						note: 'Migré depuis le solde réel unique',
					}],
				};
			}
			return synced;
		});
	}

	base.dataVersion = CURRENT_DATA_VERSION;
	return base;
}

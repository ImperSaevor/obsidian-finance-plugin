import type { ForecastFrequency, RecurringTransaction } from '../types';

export function getRecurringDueDates(
	recurring: RecurringTransaction,
	fromDate: string,
	toDate: string,
): string[] {
	const dates: string[] = [];
	const from = new Date(fromDate);
	const to = new Date(toDate);
	const start = new Date(recurring.startDate);
	const end = recurring.endDate ? new Date(recurring.endDate) : to;
	let current = new Date(Math.max(start.getTime(), from.getTime()));
	const lastGenerated = recurring.lastGeneratedDate ? new Date(recurring.lastGeneratedDate) : null;

	while (current <= to && current <= end) {
		const iso = current.toISOString().slice(0, 10);
		if (current >= from) {
			if (!lastGenerated || iso > recurring.lastGeneratedDate!) {
				dates.push(iso);
			}
		}
		advanceDate(current, recurring.frequency);
		if (recurring.frequency === 'once') break;
	}

	// Première génération : une seule échéance (la plus récente) pour éviter un historique massif
	if (!recurring.lastGeneratedDate && dates.length > 1) {
		return [dates[dates.length - 1]];
	}

	return dates;
}

function advanceDate(date: Date, frequency: ForecastFrequency): void {
	switch (frequency) {
		case 'once':
			date.setFullYear(date.getFullYear() + 100);
			break;
		case 'weekly':
			date.setDate(date.getDate() + 7);
			break;
		case 'monthly':
			date.setMonth(date.getMonth() + 1);
			break;
		case 'yearly':
			date.setFullYear(date.getFullYear() + 1);
			break;
	}
}

export function formatCurrency(amount: number, currency: string, locale = 'fr-FR'): string {
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency,
	}).format(amount);
}

export function formatDate(dateStr: string, locale = 'fr-FR'): string {
	const date = new Date(dateStr);
	if (isNaN(date.getTime())) return dateStr;
	return date.toLocaleDateString(locale);
}

export function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

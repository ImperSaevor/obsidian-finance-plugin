import type { TransactionType } from '../types';
import { generateId } from './id';

export interface CsvImportRow {
	date: string;
	description: string;
	amount: number;
	type: TransactionType;
	categoryName?: string;
	tags: string[];
}

export interface CsvImportResult {
	rows: CsvImportRow[];
	errors: string[];
}

function parseCsvLine(line: string, delimiter: string): string[] {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (ch === delimiter && !inQuotes) {
			result.push(current.trim());
			current = '';
		} else {
			current += ch;
		}
	}
	result.push(current.trim());
	return result;
}

function detectDelimiter(headerLine: string): string {
	if (headerLine.includes(';')) return ';';
	if (headerLine.includes('\t')) return '\t';
	return ',';
}

function normalizeDate(value: string): string | null {
	const v = value.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
	const fr = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
	if (fr) {
		const [, d, m, y] = fr;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}
	return null;
}

function inferType(amount: number, explicit?: string): TransactionType {
	if (explicit) {
		const t = explicit.toLowerCase();
		if (t.includes('revenu') || t === 'income') return 'income';
		if (t.includes('transfert') || t === 'transfer') return 'transfer';
	}
	return amount < 0 ? 'expense' : 'income';
}

export function parseCsvTransactions(content: string): CsvImportResult {
	const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
	const result: CsvImportResult = { rows: [], errors: [] };
	if (lines.length < 2) {
		result.errors.push('Le fichier doit contenir une ligne d\'en-tête et au moins une ligne de données.');
		return result;
	}

	const delimiter = detectDelimiter(lines[0]);
	const headers = parseCsvLine(lines[0], delimiter).map(h => h.toLowerCase().replace(/^\ufeff/, ''));

	const col = (names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));

	const dateCol = col(['date']);
	const descCol = col(['description', 'libellé', 'libelle', 'label', 'memo']);
	const amountCol = col(['montant', 'amount', 'valeur']);
	const typeCol = col(['type']);
	const catCol = col(['catégorie', 'categorie', 'category']);
	const tagsCol = col(['tags', 'tag']);

	if (dateCol < 0 || descCol < 0 || amountCol < 0) {
		result.errors.push('Colonnes requises : date, description, montant (noms flexibles).');
		return result;
	}

	for (let i = 1; i < lines.length; i++) {
		const cells = parseCsvLine(lines[i], delimiter);
		const date = normalizeDate(cells[dateCol] ?? '');
		const description = (cells[descCol] ?? '').trim();
		const amountRaw = (cells[amountCol] ?? '').replace(/\s/g, '').replace(',', '.');
		const amount = parseFloat(amountRaw);

		if (!date) {
			result.errors.push(`Ligne ${i + 1} : date invalide.`);
			continue;
		}
		if (!description) {
			result.errors.push(`Ligne ${i + 1} : description vide.`);
			continue;
		}
		if (Number.isNaN(amount)) {
			result.errors.push(`Ligne ${i + 1} : montant invalide.`);
			continue;
		}

		const type = inferType(amount, typeCol >= 0 ? cells[typeCol] : undefined);
		result.rows.push({
			date,
			description,
			amount,
			type,
			categoryName: catCol >= 0 ? cells[catCol]?.trim() || undefined : undefined,
			tags: tagsCol >= 0 ? (cells[tagsCol] ?? '').split(/[,;]/).map(t => t.trim()).filter(Boolean) : [],
		});
	}

	return result;
}

export function csvRowToTransaction(
	row: CsvImportRow,
	accountId: string,
	categoryId?: string,
): Omit<import('../types').Transaction, 'id'> {
	const amount = row.type === 'expense' ? -Math.abs(row.amount) : Math.abs(row.amount);
	return {
		accountId,
		date: row.date,
		amount,
		description: row.description,
		categoryId,
		tags: row.tags,
		type: row.type === 'transfer' ? 'expense' : row.type,
	};
}

export function generateImportId(): string {
	return generateId();
}

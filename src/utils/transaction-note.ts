import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type { FinancePluginSettings } from '../settings';
import type { Account, Category, Transaction } from '../types';
import type { FinanceStore } from '../store/finance-store';
import { formatCurrency, formatDate } from './format';
import { FINANCE_TX_LINK_PREFIX, FINANCE_TX_MARKER_PREFIX } from './transaction-links';
import { ensureVaultFolder } from './vault-folders';

const NOTE_SECTION = '## Finances liées';
const MAX_NOTE_BASE_LENGTH = 120;

function getNotesFolder(settings: FinancePluginSettings): string {
	return normalizePath(settings.transactionNotesFolder || `${settings.dataFolder}/Transactions`);
}

import { sanitizeNoteBaseName } from './note-names';

/** Ancien format de nommage basé sur l'identifiant (migration). */
export function getLegacyTransactionNotePath(tx: Transaction, settings: FinancePluginSettings): string {
	return normalizePath(`${getNotesFolder(settings)}/${tx.id}.md`);
}

/** Résout des chemins uniques pour toutes les transactions (gestion des doublons). */
export function resolveTransactionNotePaths(
	transactions: Transaction[],
	settings: FinancePluginSettings,
): Map<string, string> {
	const folder = getNotesFolder(settings);
	const usedNames = new Map<string, number>();
	const result = new Map<string, string>();

	for (const tx of transactions) {
		const base = sanitizeNoteBaseName(tx.description);
		const key = base.toLowerCase();
		const count = usedNames.get(key) ?? 0;
		usedNames.set(key, count + 1);

		let fileName = base;
		if (count > 0) {
			const suffix = ` (${count + 1})`;
			fileName = `${base.slice(0, Math.max(1, MAX_NOTE_BASE_LENGTH - suffix.length))}${suffix}`;
		}

		result.set(tx.id, normalizePath(`${folder}/${fileName}.md`));
	}

	return result;
}

export function getTransactionNotePath(
	tx: Transaction,
	settings: FinancePluginSettings,
	allTransactions?: Transaction[],
): string {
	if (allTransactions?.length) {
		return resolveTransactionNotePaths(allTransactions, settings).get(tx.id)
			?? normalizePath(`${getNotesFolder(settings)}/${sanitizeNoteBaseName(tx.description)}.md`);
	}
	return normalizePath(`${getNotesFolder(settings)}/${sanitizeNoteBaseName(tx.description)}.md`);
}

async function findTransactionNoteFile(
	app: App,
	tx: Transaction,
	settings: FinancePluginSettings,
	allTransactions: Transaction[],
): Promise<{ file: TFile | null; currentPath: string; targetPath: string }> {
	const targetPath = getTransactionNotePath(tx, settings, allTransactions);
	let file = app.vault.getAbstractFileByPath(targetPath);
	if (file instanceof TFile) {
		return { file, currentPath: targetPath, targetPath };
	}

	const legacyPath = getLegacyTransactionNotePath(tx, settings);
	if (legacyPath !== targetPath) {
		file = app.vault.getAbstractFileByPath(legacyPath);
		if (file instanceof TFile) {
			return { file, currentPath: legacyPath, targetPath };
		}
	}

	const folder = getNotesFolder(settings);
	const folderEntry = app.vault.getAbstractFileByPath(folder);
	if (folderEntry instanceof TFolder) {
		const marker = `finance-transaction-id: ${tx.id}`;
		for (const child of folderEntry.children) {
			if (!(child instanceof TFile) || child.extension !== 'md') continue;
			const content = await app.vault.cachedRead(child);
			if (content.includes(marker)) {
				return { file: child, currentPath: child.path, targetPath };
			}
		}
	}

	return { file: null, currentPath: targetPath, targetPath };
}

export function buildTransactionNoteContent(
	tx: Transaction,
	account: Account | undefined,
	category: Category | undefined,
	settings: FinancePluginSettings,
): string {
	const currency = account?.currency ?? settings.defaultCurrency;
	const amount = formatCurrency(tx.amount, currency, settings.dateFormat);
	const lines = [
		'---',
		`finance-transaction-id: ${tx.id}`,
		'finance-type: transaction',
		'---',
		'',
		`# ${tx.description}`,
		'',
		`| Champ | Valeur |`,
		`| --- | --- |`,
		`| Date | ${formatDate(tx.date, settings.dateFormat)} |`,
		`| Montant | ${amount} |`,
		`| Type | ${tx.type} |`,
		`| Compte | ${account?.name ?? '—'} |`,
		`| Catégorie | ${category?.name ?? '—'} |`,
		`| Tags | ${tx.tags.join(', ') || '—'} |`,
		'',
		`> [!info] Transaction Finance`,
		`> Identifiant : \`${tx.id}\``,
		'',
		`\`\`\`finance-tx`,
		tx.id,
		'```',
		'',
	];
	return lines.join('\n');
}

export async function ensureTransactionNotesFolder(
	app: App,
	settings: FinancePluginSettings,
): Promise<void> {
	await ensureVaultFolder(app, getNotesFolder(settings));
}

export async function syncTransactionNote(
	app: App,
	store: FinanceStore,
	tx: Transaction,
	settings: FinancePluginSettings,
): Promise<void> {
	if (!settings.transactionsAsNotes) return;

	await ensureTransactionNotesFolder(app, settings);
	const allTransactions = store.getTransactions();
	const account = store.getAccount(tx.accountId);
	const category = store.getCategories().find(c => c.id === tx.categoryId);
	const content = buildTransactionNoteContent(tx, account, category, settings);

	const { file: existingFile, currentPath, targetPath } = await findTransactionNoteFile(
		app, tx, settings, allTransactions,
	);

	if (existingFile) {
		if (currentPath !== targetPath) {
			const atTarget = app.vault.getAbstractFileByPath(targetPath);
			if (!(atTarget instanceof TFile)) {
				await app.vault.rename(existingFile, targetPath);
				const renamed = app.vault.getAbstractFileByPath(targetPath);
				if (renamed instanceof TFile) {
					await app.vault.modify(renamed, content);
				}
			} else {
				await app.vault.modify(existingFile, content);
			}
		} else {
			await app.vault.modify(existingFile, content);
		}
	} else {
		try {
			await app.vault.create(targetPath, content);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (msg.toLowerCase().includes('already exists')) {
				const existing = app.vault.getAbstractFileByPath(targetPath);
				if (existing instanceof TFile) {
					await app.vault.modify(existing, content);
				}
			} else {
				throw error;
			}
		}
	}
}

export async function deleteTransactionNote(
	app: App,
	tx: Transaction,
	settings: FinancePluginSettings,
	allTransactions?: Transaction[],
): Promise<void> {
	if (!settings.transactionsAsNotes) return;

	const { file } = await findTransactionNoteFile(
		app,
		tx,
		settings,
		allTransactions ?? [tx],
	);
	if (file instanceof TFile) {
		await app.vault.trash(file, true);
	}
}

export function buildLinkedNoteLine(
	tx: Transaction,
	currency: string,
	locale: string,
	settings: FinancePluginSettings,
	allTransactions?: Transaction[],
): string {
	const label = `${formatDate(tx.date, locale)} · ${tx.description} · ${formatCurrency(tx.amount, currency, locale)}`;
	const marker = `${FINANCE_TX_MARKER_PREFIX}${tx.id} -->`;

	if (settings.transactionsAsNotes) {
		const notePath = getTransactionNotePath(tx, settings, allTransactions);
		const linkPath = notePath.replace(/\.md$/i, '');
		return `- [[${linkPath}|${label}]] ${marker}`;
	}

	return `- [${label}](${FINANCE_TX_LINK_PREFIX}${tx.id}) ${marker}`;
}

export async function syncTransactionInNote(
	app: App,
	tx: Transaction,
	currency: string,
	locale: string,
	enabled: boolean,
	settings: FinancePluginSettings,
	allTransactions?: Transaction[],
): Promise<void> {
	if (!enabled || !tx.notePath) return;

	const file = app.vault.getAbstractFileByPath(normalizePath(tx.notePath));
	if (!(file instanceof TFile)) return;

	const line = buildLinkedNoteLine(tx, currency, locale, settings, allTransactions);
	const marker = `${FINANCE_TX_MARKER_PREFIX}${tx.id} -->`;
	let content = await app.vault.read(file);

	if (content.includes(marker)) {
		content = content
			.split('\n')
			.map(l => (l.includes(marker) ? line : l))
			.join('\n');
	} else if (content.includes(NOTE_SECTION)) {
		const idx = content.indexOf(NOTE_SECTION) + NOTE_SECTION.length;
		content = `${content.slice(0, idx)}\n${line}${content.slice(idx)}`;
	} else {
		content = `${content.trimEnd()}\n\n${NOTE_SECTION}\n${line}\n`;
	}

	await app.vault.modify(file, content);
}

export async function removeTransactionFromNote(app: App, tx: Transaction): Promise<void> {
	if (!tx.notePath) return;

	const file = app.vault.getAbstractFileByPath(normalizePath(tx.notePath));
	if (!(file instanceof TFile)) return;

	const marker = `${FINANCE_TX_MARKER_PREFIX}${tx.id} -->`;
	const content = await app.vault.read(file);
	if (!content.includes(marker)) return;

	const updated = content
		.split('\n')
		.filter(line => !line.includes(marker))
		.join('\n');
	await app.vault.modify(file, updated);
}

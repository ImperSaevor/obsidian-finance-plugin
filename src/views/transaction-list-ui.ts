import type FinancePlugin from '../../main';
import type { Account, Category, Transaction } from '../types';
import type { FinancePluginSettings } from '../settings';
import { CalculatedTransactionModal } from '../modals/calculated-transaction-modal';
import { DuplicateTransactionModal } from '../modals/duplicate-transaction-modal';
import { TransactionModal } from '../modals/transaction-modal';
import { createCollapse } from '../utils/collapse';
import { formatCurrency, formatDate } from '../utils/format';
import { openNoteAtPath, renderObsidianNoteLink } from '../utils/note-links';
import { getTransactionNotePath } from '../utils/transaction-note';
import { renderTransactionOpenLink } from '../utils/transaction-links';
import { describeCalculation } from '../utils/transaction-calc';
import {
	applyFiltersAndSort,
	DEFAULT_TX_FILTER,
	groupTransactions,
	hasActiveFilters,
	type TransactionFilterState,
	countActiveFilters,
} from '../utils/transaction-filters';

export interface TransactionListContext {
	plugin: FinancePlugin;
	accounts: Account[];
	categories: Category[];
	allTransactions: Transaction[];
	settings: FinancePluginSettings;
	currency: string;
	showAccountColumn?: boolean;
	compact?: boolean;
	onRefresh: () => void;
	page?: number;
	pageSize?: number;
	onPageChange?: (page: number) => void;
	selectedIds?: Set<string>;
	onSelectionChange?: (ids: Set<string>) => void;
	enableBulk?: boolean;
}

function cloneFilter(f: TransactionFilterState): TransactionFilterState {
	return { ...f };
}

function renderPagination(
	parent: HTMLElement,
	total: number,
	page: number,
	pageSize: number,
	onPageChange: (page: number) => void,
): void {
	const pages = Math.max(1, Math.ceil(total / pageSize));
	if (pages <= 1) return;

	const row = parent.createDiv({ cls: 'finance-pagination' });
	row.createEl('button', { text: '←', cls: page > 0 ? '' : 'disabled' })
		.addEventListener('click', () => { if (page > 0) onPageChange(page - 1); });
	row.createSpan({ text: `Page ${page + 1} / ${pages}`, cls: 'finance-pagination-label' });
	row.createEl('button', { text: '→', cls: page < pages - 1 ? '' : 'disabled' })
		.addEventListener('click', () => { if (page < pages - 1) onPageChange(page + 1); });
}

function renderBulkToolbar(
	parent: HTMLElement,
	selectedIds: Set<string>,
	ctx: TransactionListContext,
): void {
	if (!ctx.enableBulk || selectedIds.size === 0) return;

	const bar = parent.createDiv({ cls: 'finance-bulk-toolbar' });
	bar.createSpan({ text: `${selectedIds.size} sélectionnée(s)` });

	bar.createEl('button', { text: 'Supprimer' })
		.addEventListener('click', async () => {
			const { confirmAction } = await import('../utils/confirm');
			if (await confirmAction(ctx.plugin.app, 'Supprimer', `Supprimer ${selectedIds.size} transaction(s) ?`)) {
				await ctx.plugin.store.deleteTransactions([...selectedIds]);
				selectedIds.clear();
				ctx.onSelectionChange?.(selectedIds);
				ctx.onRefresh();
			}
		});

	bar.createEl('button', { text: 'Sans catégorie' })
		.addEventListener('click', async () => {
			await ctx.plugin.store.bulkUpdateCategory([...selectedIds], undefined);
			selectedIds.clear();
			ctx.onSelectionChange?.(selectedIds);
			ctx.onRefresh();
		});

	const catSelect = bar.createEl('select');
	catSelect.createEl('option', { text: 'Recatégoriser…', value: '' });
	for (const c of ctx.categories) {
		catSelect.createEl('option', { text: c.name, value: c.id });
	}
	catSelect.addEventListener('change', async () => {
		if (!catSelect.value) return;
		await ctx.plugin.store.bulkUpdateCategory([...selectedIds], catSelect.value);
		catSelect.value = '';
		selectedIds.clear();
		ctx.onSelectionChange?.(selectedIds);
		ctx.onRefresh();
	});
}

export function renderFilterSortBar(
	parent: HTMLElement,
	state: TransactionFilterState,
	categories: Category[],
	allTags: string[],
	onChange: (state: TransactionFilterState) => void,
): void {
	const bar = parent.createDiv({ cls: 'finance-filter-bar' });

	const row1 = bar.createDiv({ cls: 'finance-filter-row' });
	row1.createSpan({ text: 'Recherche' });
	const searchInput = row1.createEl('input', {
		type: 'search',
		cls: 'finance-filter-input',
		placeholder: 'Description, tag…',
	});
	searchInput.value = state.search;
	let searchTimer: number | undefined;
	searchInput.addEventListener('input', () => {
		window.clearTimeout(searchTimer);
		searchTimer = window.setTimeout(() => {
			onChange({ ...state, search: searchInput.value });
		}, 300);
	});

	row1.createSpan({ text: 'Type' });
	const typeSelect = row1.createEl('select');
	for (const [val, label] of [['', 'Tous'], ['income', 'Revenu'], ['expense', 'Dépense'], ['transfer', 'Transfert']]) {
		const opt = typeSelect.createEl('option', { text: label, value: val });
		if (state.type === val) opt.selected = true;
	}
	typeSelect.addEventListener('change', () => {
		onChange({ ...state, type: typeSelect.value as TransactionFilterState['type'] });
	});

	row1.createSpan({ text: 'Catégorie' });
	const catSelect = row1.createEl('select');
	catSelect.createEl('option', { text: 'Toutes', value: '' });
	for (const c of categories) {
		const opt = catSelect.createEl('option', { text: c.name, value: c.id });
		if (c.id === state.categoryId) opt.selected = true;
	}
	catSelect.addEventListener('change', () => {
		onChange({ ...state, categoryId: catSelect.value });
	});

	const row2 = bar.createDiv({ cls: 'finance-filter-row' });
	row2.createSpan({ text: 'Du' });
	const fromInput = row2.createEl('input', { type: 'date', cls: 'finance-filter-input' });
	fromInput.value = state.dateFrom;
	fromInput.addEventListener('change', () => onChange({ ...state, dateFrom: fromInput.value }));

	row2.createSpan({ text: 'au' });
	const toInput = row2.createEl('input', { type: 'date', cls: 'finance-filter-input' });
	toInput.value = state.dateTo;
	toInput.addEventListener('change', () => onChange({ ...state, dateTo: toInput.value }));

	row2.createSpan({ text: 'Tag' });
	const tagSelect = row2.createEl('select');
	tagSelect.createEl('option', { text: 'Tous', value: '' });
	for (const tag of allTags) {
		const opt = tagSelect.createEl('option', { text: tag, value: tag });
		if (tag === state.tag) opt.selected = true;
	}
	tagSelect.addEventListener('change', () => onChange({ ...state, tag: tagSelect.value }));

	const row3 = bar.createDiv({ cls: 'finance-filter-row' });
	row3.createSpan({ text: 'Trier par' });
	const sortSelect = row3.createEl('select');
	for (const [val, label] of [
		['date', 'Date'], ['amount', 'Montant'], ['description', 'Description'],
		['category', 'Catégorie'], ['type', 'Type'],
	]) {
		const opt = sortSelect.createEl('option', { text: label, value: val });
		if (state.sortField === val) opt.selected = true;
	}
	sortSelect.addEventListener('change', () => {
		onChange({ ...state, sortField: sortSelect.value as TransactionFilterState['sortField'] });
	});

	const dirSelect = row3.createEl('select');
	for (const [val, label] of [['desc', '↓ Desc'], ['asc', '↑ Asc']]) {
		const opt = dirSelect.createEl('option', { text: label, value: val });
		if (state.sortDirection === val) opt.selected = true;
	}
	dirSelect.addEventListener('change', () => {
		onChange({ ...state, sortDirection: dirSelect.value as TransactionFilterState['sortDirection'] });
	});

	row3.createSpan({ text: 'Grouper par' });
	const groupSelect = row3.createEl('select');
	for (const [val, label] of [
		['none', 'Aucun'], ['month', 'Mois'], ['day', 'Jour'],
		['category', 'Catégorie'], ['type', 'Type'], ['amount_sign', 'Revenu/Dépense'],
	]) {
		const opt = groupSelect.createEl('option', { text: label, value: val });
		if (state.groupBy === val) opt.selected = true;
	}
	groupSelect.addEventListener('change', () => {
		onChange({
			...state,
			groupBy: groupSelect.value as TransactionFilterState['groupBy'],
		});
	});

	const collapseLabel = row3.createEl('label', { cls: 'finance-filter-check' });
	const collapseCheck = collapseLabel.createEl('input', { type: 'checkbox' });
	collapseCheck.checked = state.collapseGroups;
	collapseLabel.createSpan({ text: ' Collapses par groupe' });
	collapseCheck.addEventListener('change', () => {
		onChange({ ...state, collapseGroups: collapseCheck.checked });
	});

	row3.createEl('button', { text: 'Réinitialiser', cls: 'finance-filter-reset' })
		.addEventListener('click', () => onChange(cloneFilter(DEFAULT_TX_FILTER)));
}

export function renderFilterResultsMeta(
	parent: HTMLElement,
	shown: number,
	total: number,
	state: TransactionFilterState,
	onReset: (state: TransactionFilterState) => void,
): void {
	const meta = parent.createDiv({ cls: 'finance-filter-meta' });
	const parts: string[] = [`${shown} / ${total} transaction(s)`];
	if (hasActiveFilters(state)) {
		parts.push(`${countActiveFilters(state)} filtre(s) actif(s)`);
	}
	meta.createSpan({ text: parts.join(' · ') });

	if (hasActiveFilters(state)) {
		meta.createEl('button', { text: 'Réinitialiser les filtres', cls: 'finance-filter-reset-inline' })
			.addEventListener('click', () => onReset(cloneFilter(DEFAULT_TX_FILTER)));
	}

	if (shown === 0 && total > 0 && hasActiveFilters(state)) {
		parent.createEl('p', {
			text: 'Aucune transaction ne correspond aux filtres actuels. Élargissez la plage de dates ou réinitialisez.',
			cls: 'finance-empty finance-filter-empty-hint',
		});
	}
}

function renderCompactTransactionItems(
	list: HTMLElement,
	transactions: Transaction[],
	ctx: TransactionListContext,
	showAccountName?: boolean,
): void {
	for (const tx of transactions) {
		const item = list.createDiv({ cls: 'finance-occurrence-item' });
		item.createSpan({ text: formatDate(tx.date, ctx.settings.dateFormat), cls: 'finance-occ-date' });
		if (showAccountName) {
			const account = ctx.accounts.find(a => a.id === tx.accountId);
			item.createSpan({ text: account?.name ?? '—', cls: 'finance-occ-account' });
		}
		const descSpan = item.createSpan({ cls: 'finance-tx-desc' });
		renderTransactionOpenLink(descSpan, ctx.plugin, tx, ctx.onRefresh);
		if (ctx.settings.transactionsAsNotes) {
			descSpan.createSpan({ text: ' ' });
			renderObsidianNoteLink(
				descSpan.createSpan({ cls: 'finance-tx-note-inline' }),
				ctx.plugin.app,
				getTransactionNotePath(tx, ctx.settings, ctx.allTransactions),
			);
		} else if (tx.notePath) {
			descSpan.createSpan({ text: ' ' });
			renderObsidianNoteLink(descSpan.createSpan({ cls: 'finance-tx-note-inline' }), ctx.plugin.app, tx.notePath);
		}
		item.createSpan({
			text: formatCurrency(
				tx.amount,
				ctx.accounts.find(a => a.id === tx.accountId)?.currency ?? ctx.currency,
				ctx.settings.dateFormat,
			),
			cls: tx.amount >= 0 ? 'positive' : 'negative',
		});
	}
}

function renderTransactionRow(
	row: HTMLElement,
	tx: Transaction,
	ctx: TransactionListContext,
): void {
	const { accounts, categories, allTransactions, settings, currency, showAccountColumn, onRefresh, plugin } = ctx;
	const account = accounts.find(a => a.id === tx.accountId);
	const category = categories.find(c => c.id === tx.categoryId);
	const store = plugin.store;

	if (ctx.enableBulk && ctx.selectedIds) {
		const checkTd = row.createEl('td', { cls: 'finance-check-col' });
		const check = checkTd.createEl('input', { type: 'checkbox' });
		check.checked = ctx.selectedIds.has(tx.id);
		check.addEventListener('change', () => {
			if (check.checked) ctx.selectedIds!.add(tx.id);
			else ctx.selectedIds!.delete(tx.id);
			ctx.onSelectionChange?.(ctx.selectedIds!);
		});
	}

	row.createEl('td', { text: formatDate(tx.date, settings.dateFormat) });
	const descTd = row.createEl('td');
	renderTransactionOpenLink(descTd.createSpan({ cls: 'finance-tx-desc' }), plugin, tx, onRefresh);
	if (tx.useCalculatedAmount && tx.calculationLinks?.length) {
		descTd.createSpan({ text: ' 🔗', cls: 'finance-calc-icon' });
	}
	if (tx.notePath) {
		descTd.createSpan({ text: ' ' });
		const noteSpan = descTd.createSpan({ cls: 'finance-tx-note-inline' });
		renderObsidianNoteLink(noteSpan, plugin.app, tx.notePath);
	}

	if (!ctx.compact) {
		const noteTd = row.createEl('td', { cls: 'finance-note-cell' });
		if (ctx.settings.transactionsAsNotes) {
			renderObsidianNoteLink(noteTd, plugin.app, getTransactionNotePath(tx, ctx.settings, ctx.allTransactions));
		} else {
			renderObsidianNoteLink(noteTd, plugin.app, tx.notePath);
		}

		const linksTd = row.createEl('td', { cls: 'finance-calc-formula' });
		if (tx.useCalculatedAmount && tx.calculationLinks?.length) {
			linksTd.setText(describeCalculation(tx.calculationLinks, allTransactions));
		} else if (tx.sourceTransactionId) {
			const src = allTransactions.find(t => t.id === tx.sourceTransactionId);
			linksTd.setText(src ? `← ${src.description}` : '—');
		} else {
			linksTd.setText('—');
		}
	}

	if (showAccountColumn) {
		row.createEl('td', { text: account?.name ?? '—' });
	}

	if (!ctx.compact) {
		row.createEl('td', { text: category?.name ?? '—' });
		row.createEl('td', { text: tx.tags.join(', ') || '—' });
		row.createEl('td', { text: tx.type, cls: 'finance-tx-type' });
	}

	row.createEl('td', {
		text: formatCurrency(tx.amount, account?.currency ?? currency, settings.dateFormat),
		cls: tx.amount >= 0 ? 'positive' : 'negative',
	});

	const actionsTd = row.createEl('td', { cls: 'finance-row-actions' });
	actionsTd.createEl('button', { text: '✎' })
		.addEventListener('click', () => {
			new TransactionModal(plugin.app, store, settings, tx, null, onRefresh).open();
		});
	if (!ctx.compact) {
		const calcBtn = actionsTd.createEl('button', { text: '∑' });
		calcBtn.setAttr('title', 'Calculer');
		calcBtn.addEventListener('click', () => {
			new CalculatedTransactionModal(plugin.app, store, settings, [tx], onRefresh).open();
		});
		const dupBtn = actionsTd.createEl('button', { text: '⎘' });
		dupBtn.setAttr('title', 'Dupliquer');
		dupBtn.addEventListener('click', () => {
			new DuplicateTransactionModal(plugin.app, store, tx, onRefresh).open();
		});
		if (tx.notePath) {
			const noteBtn = actionsTd.createEl('button', { text: '📄' });
			noteBtn.setAttr('title', 'Ouvrir la note liée');
			noteBtn.addEventListener('click', () => openNoteAtPath(plugin.app, tx.notePath!));
		}
	}
	actionsTd.createEl('button', { text: '✕', cls: 'mod-warning' })
		.addEventListener('click', async () => {
			const { confirmAction } = await import('../utils/confirm');
			if (!await confirmAction(plugin.app, 'Supprimer', `Supprimer « ${tx.description} » ?`)) return;
			await store.deleteTransaction(tx.id);
			onRefresh();
		});
}

export function renderTransactionTable(
	parent: HTMLElement,
	transactions: Transaction[],
	ctx: TransactionListContext,
): void {
	if (transactions.length === 0) {
		parent.createEl('p', { text: 'Aucune transaction correspondante.', cls: 'finance-empty' });
		return;
	}

	if (ctx.enableBulk && ctx.selectedIds) {
		renderBulkToolbar(parent, ctx.selectedIds, ctx);
	}

	const page = ctx.page ?? 0;
	const pageSize = ctx.pageSize ?? transactions.length;
	const paged = pageSize < transactions.length
		? transactions.slice(page * pageSize, (page + 1) * pageSize)
		: transactions;

	const table = parent.createEl('table', { cls: 'finance-table' });
	const headRow = table.createEl('thead').createEl('tr');
	const cols: string[] = [];
	if (ctx.enableBulk) cols.push('');
	cols.push('Date', 'Description');
	if (!ctx.compact) cols.push('Note', 'Liens');
	if (ctx.showAccountColumn) cols.push('Compte');
	if (!ctx.compact) cols.push('Catégorie', 'Tags', 'Type');
	cols.push('Montant', '');
	for (const col of cols) headRow.createEl('th', { text: col });

	const tbody = table.createEl('tbody');
	for (const tx of paged) {
		renderTransactionRow(tbody.createEl('tr'), tx, ctx);
	}

	if (ctx.onPageChange && pageSize < transactions.length) {
		renderPagination(parent, transactions.length, page, pageSize, ctx.onPageChange);
	}
}

export function renderFilteredTransactionList(
	parent: HTMLElement,
	transactions: Transaction[],
	filterState: TransactionFilterState,
	ctx: TransactionListContext,
	onFilterChange: (state: TransactionFilterState) => void,
	options?: {
		showFilterBar?: boolean;
		collapseEnabled?: boolean;
		showAllWhenFilteredEmpty?: boolean;
	},
): void {
	const allTags = [...new Set(ctx.allTransactions.flatMap(t => t.tags))].sort();
	const processed = applyFiltersAndSort(transactions, filterState, ctx.categories);

	if (options?.showFilterBar !== false) {
		renderFilterSortBar(parent, filterState, ctx.categories, allTags, onFilterChange);
	}

	renderFilterResultsMeta(parent, processed.length, transactions.length, filterState, onFilterChange);

	const listContainer = parent.createDiv({ cls: 'finance-filter-results' });

	if (transactions.length === 0) {
		listContainer.createEl('p', { text: 'Aucune transaction enregistrée.', cls: 'finance-empty' });
		return;
	}

	if (processed.length === 0) {
		listContainer.createEl('p', {
			text: 'Aucune transaction ne correspond aux filtres.',
			cls: 'finance-empty',
		});
		if (options?.showAllWhenFilteredEmpty) {
			listContainer.createEl('p', {
				text: 'Affichage de toutes les transactions du périmètre sélectionné :',
				cls: 'finance-modal-hint',
			});
			renderTransactionTable(listContainer, transactions, ctx);
		}
		return;
	}

	const useCollapse = options?.collapseEnabled !== false
		&& filterState.collapseGroups
		&& filterState.groupBy !== 'none';
	const groups = groupTransactions(
		processed,
		filterState.groupBy,
		ctx.categories,
		ctx.settings.dateFormat,
	);

	if (useCollapse) {
		for (const group of groups) {
			const badge = `${group.transactions.length} · ${formatCurrency(group.total, ctx.currency, ctx.settings.dateFormat)}`;
			const body = createCollapse(listContainer, group.label, {
				open: true,
				cls: 'finance-collapse-nested',
				badge,
			});
			renderTransactionTable(body, group.transactions, ctx);
		}
	} else if (filterState.groupBy !== 'none') {
		for (const group of groups) {
			const header = listContainer.createDiv({ cls: 'finance-group-header' });
			header.createEl('h4', { text: group.label });
			header.createSpan({
				text: `${group.transactions.length} · ${formatCurrency(group.total, ctx.currency, ctx.settings.dateFormat)}`,
				cls: 'finance-collapse-badge',
			});
			renderTransactionTable(listContainer, group.transactions, ctx);
		}
	} else {
		renderTransactionTable(listContainer, processed, ctx);
	}
}

export function renderCompactTransactionList(
	parent: HTMLElement,
	transactions: Transaction[],
	filterState: TransactionFilterState,
	ctx: TransactionListContext,
	onFilterChange: (state: TransactionFilterState) => void,
	options?: { showFilterBar?: boolean; filterCategories?: Category[]; showAccountName?: boolean; collapseByDefault?: boolean },
): void {
	const filterCategories = options?.filterCategories ?? ctx.categories;
	if (options?.showFilterBar !== false) {
		const allTags = [...new Set(ctx.allTransactions.flatMap(t => t.tags))].sort();
		renderFilterSortBar(parent, filterState, filterCategories, allTags, onFilterChange);
	}

	const effectiveFilter = options?.collapseByDefault && filterState.groupBy === 'none'
		? { ...filterState, groupBy: 'month' as const, collapseGroups: true }
		: filterState;

	const processed = applyFiltersAndSort(transactions, effectiveFilter, ctx.categories);
	const compactCtx = { ...ctx, compact: true };

	if (processed.length === 0) {
		if (transactions.length > 0 && hasActiveFilters(filterState)) {
			parent.createEl('p', {
				text: 'Aucune transaction ne correspond aux filtres.',
				cls: 'finance-empty',
			});
		}
		return;
	}

	if (effectiveFilter.collapseGroups && effectiveFilter.groupBy !== 'none') {
		const groups = groupTransactions(processed, effectiveFilter.groupBy, ctx.categories, ctx.settings.dateFormat);
		for (const group of groups) {
			const badge = formatCurrency(group.total, ctx.currency, ctx.settings.dateFormat);
			const body = createCollapse(parent, group.label, {
				open: true,
				cls: 'finance-collapse-nested',
				badge: `${group.transactions.length} · ${badge}`,
			});
			const list = body.createDiv({ cls: 'finance-overview-tx-list' });
			renderCompactTransactionItems(list, group.transactions, compactCtx, options?.showAccountName);
		}
	} else if (effectiveFilter.groupBy !== 'none') {
		const groups = groupTransactions(processed, effectiveFilter.groupBy, ctx.categories, ctx.settings.dateFormat);
		for (const group of groups) {
			const header = parent.createDiv({ cls: 'finance-group-header' });
			header.createEl('h4', { text: group.label });
			header.createSpan({
				text: `${group.transactions.length} · ${formatCurrency(group.total, ctx.currency, ctx.settings.dateFormat)}`,
				cls: 'finance-collapse-badge',
			});
			const list = parent.createDiv({ cls: 'finance-overview-tx-list' });
			renderCompactTransactionItems(list, group.transactions, compactCtx, options?.showAccountName);
		}
	} else {
		const list = parent.createDiv({ cls: 'finance-overview-tx-list' });
		renderCompactTransactionItems(list, processed, compactCtx, options?.showAccountName);
	}
}

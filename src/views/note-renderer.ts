import { MarkdownRenderer, normalizePath, Notice, TFile } from 'obsidian';
import type FinancePlugin from '../../main';
import { generateFinanceNote } from '../utils/note-generator';

export async function renderFinanceNoteTab(
	el: HTMLElement,
	plugin: FinancePlugin,
	accountId: string | null,
	onAccountChange: (id: string | null) => void,
): Promise<void> {
	const store = plugin.store;
	const accounts = store.getAccounts();

	el.empty();

	const toolbar = el.createDiv({ cls: 'finance-toolbar' });
	if (accounts.length > 0) {
		const filterRow = toolbar.createDiv({ cls: 'finance-filter-row' });
		filterRow.createSpan({ text: 'Compte : ' });
		const select = filterRow.createEl('select');
		select.createEl('option', { text: 'Tous les comptes', value: '' });
		for (const a of accounts) {
			const opt = select.createEl('option', { text: a.name, value: a.id });
			if (a.id === accountId) opt.selected = true;
		}
		select.addEventListener('change', () => {
			onAccountChange(select.value || null);
		});
	}

	toolbar.createEl('button', { text: 'Créer / mettre à jour la note', cls: 'mod-cta' })
		.addEventListener('click', () => {
			void exportFinanceNote(plugin, accountId);
		});

	const preview = el.createDiv({ cls: 'finance-note-preview' });
	const markdown = generateFinanceNote(store, plugin.settings, accountId);
	await MarkdownRenderer.renderMarkdown(markdown, preview, '', plugin);
}

export async function exportFinanceNote(plugin: FinancePlugin, accountId: string | null): Promise<void> {
	const folder = plugin.settings.dataFolder;
	const fileName = accountId
		? `Finance - ${plugin.store.getAccount(accountId)?.name ?? 'compte'}.md`
		: 'Finance - Rapport.md';
	const filePath = normalizePath(`${folder}/${fileName}`);
	const content = generateFinanceNote(plugin.store, plugin.settings, accountId);

	const existing = plugin.app.vault.getAbstractFileByPath(filePath);
	if (existing instanceof TFile) {
		await plugin.app.vault.modify(existing, content);
		await plugin.app.workspace.getLeaf(false)?.openFile(existing);
		new Notice(`Note mise à jour : ${fileName}`);
	} else {
		const folderExists = plugin.app.vault.getAbstractFileByPath(folder);
		if (!folderExists) {
			await plugin.app.vault.createFolder(folder);
		}
		const file = await plugin.app.vault.create(filePath, content);
		await plugin.app.workspace.getLeaf(false)?.openFile(file);
		new Notice(`Note créée : ${fileName}`);
	}
}

export function renderFinanceEmbed(
	el: HTMLElement,
	plugin: FinancePlugin,
	accountId: string | null,
): void {
	el.addClass('finance-embed-block');
	const markdown = generateFinanceNote(plugin.store, plugin.settings, accountId);
	void MarkdownRenderer.renderMarkdown(markdown, el, '', plugin);
}

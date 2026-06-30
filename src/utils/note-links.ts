import { App, TFile, normalizePath } from 'obsidian';

export function getNoteDisplayName(notePath: string): string {
	const base = notePath.split('/').pop() ?? notePath;
	return base.replace(/\.md$/i, '');
}

export function resolveNoteFile(app: App, notePath: string): TFile | null {
	const normalized = normalizePath(notePath);
	const file = app.vault.getAbstractFileByPath(normalized);
	return file instanceof TFile ? file : null;
}

export function openNoteAtPath(app: App, notePath: string, newTab = false): void {
	const file = resolveNoteFile(app, notePath);
	if (!file) return;
	if (newTab) {
		void app.workspace.openLinkText(file.basename, file.path, true);
	} else {
		void app.workspace.getLeaf(false).openFile(file);
	}
}

export function notePathToWikilink(notePath: string): string {
	return `[[${getNoteDisplayName(notePath)}]]`;
}

export function renderObsidianNoteLink(
	parent: HTMLElement,
	app: App,
	notePath: string | undefined,
): void {
	if (!notePath) {
		parent.setText('—');
		return;
	}

	const file = resolveNoteFile(app, notePath);
	const display = file?.basename ?? getNoteDisplayName(notePath);
	const link = parent.createEl('a', {
		cls: 'internal-link finance-note-link',
		text: display,
		href: display,
	});
	link.dataset.href = display;
	link.setAttr('title', notePath);
	link.addEventListener('click', (e) => {
		e.preventDefault();
		openNoteAtPath(app, notePath);
	});
	link.addEventListener('auxclick', (e) => {
		if (e.button === 1) {
			e.preventDefault();
			openNoteAtPath(app, notePath, true);
		}
	});
}

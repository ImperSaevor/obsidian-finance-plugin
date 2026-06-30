import { App, FuzzySuggestModal, TFile } from 'obsidian';

export class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private onChoose: (path: string) => void,
	) {
		super(app);
		this.setPlaceholder('Rechercher une note…');
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file.path);
	}
}

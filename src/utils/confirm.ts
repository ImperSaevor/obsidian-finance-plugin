import { App, Modal } from 'obsidian';

export function confirmAction(app: App, title: string, message: string): Promise<boolean> {
	return new Promise(resolve => {
		const modal = new Modal(app);
		modal.titleEl.setText(title);
		modal.contentEl.createEl('p', { text: message });
		const row = modal.contentEl.createDiv({ cls: 'finance-modal-buttons' });
		row.createEl('button', { text: 'Annuler' })
			.addEventListener('click', () => { modal.close(); resolve(false); });
		row.createEl('button', { text: 'Confirmer', cls: 'mod-warning' })
			.addEventListener('click', () => { modal.close(); resolve(true); });
		modal.onClose = () => resolve(false);
		modal.open();
	});
}

import { App, Modal } from 'obsidian';

export function confirmAction(app: App, title: string, message: string): Promise<boolean> {
	return new Promise(resolve => {
		let settled = false;
		const done = (value: boolean) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};

		const modal = new Modal(app);
		modal.titleEl.setText(title);
		modal.contentEl.createEl('p', { text: message });
		const row = modal.contentEl.createDiv({ cls: 'finance-modal-buttons' });

		const cancelBtn = row.createEl('button', { text: 'Annuler', cls: 'mod-warning' });
		cancelBtn.setAttribute('type', 'button');
		cancelBtn.addEventListener('click', () => {
			done(false);
			modal.close();
		});

		const confirmBtn = row.createEl('button', { text: 'Confirmer', cls: 'mod-cta' });
		confirmBtn.setAttribute('type', 'button');
		confirmBtn.addEventListener('click', () => {
			done(true);
			modal.close();
		});

		modal.onClose = () => done(false);
		modal.open();
	});
}

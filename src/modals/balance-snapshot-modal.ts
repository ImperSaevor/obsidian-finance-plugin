import { App, Modal, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { AccountBalanceSnapshot } from '../types';
import type { FinancePluginSettings } from '../settings';
import { addDatePickerSetting } from '../utils/date-input';
import { getAccountBalanceAtDate } from '../utils/reconciliation';
import { formatCurrency } from '../utils/format';

export class BalanceSnapshotModal extends Modal {
	private snapshot: Partial<AccountBalanceSnapshot>;
	private previewEl: HTMLElement | null = null;

	constructor(
		app: App,
		private store: FinanceStore,
		private settings: FinancePluginSettings,
		private accountId: string,
		snapshot: AccountBalanceSnapshot | null,
		private onSave: () => void,
	) {
		super(app);
		this.snapshot = snapshot
			? { ...snapshot }
			: {
				date: new Date().toISOString().slice(0, 10),
				actualBalance: 0,
				note: '',
			};
	}

	private updatePreview(): void {
		if (!this.previewEl) return;
		const account = this.store.getAccount(this.accountId);
		if (!account || !this.snapshot.date) return;

		const calculated = getAccountBalanceAtDate(
			account.id,
			this.store.getTransactions(),
			account.initialBalance,
			this.snapshot.date,
		);
		const actual = this.snapshot.actualBalance ?? 0;
		const delta = actual - calculated;

		this.previewEl.empty();
		this.previewEl.createDiv({
			text: `Calculé au ${this.snapshot.date} : ${formatCurrency(calculated, account.currency, this.settings.dateFormat)}`,
			cls: 'finance-reconcile-line',
		});
		const deltaEl = this.previewEl.createDiv({
			cls: `finance-reconcile-line ${Math.abs(delta) < 0.005 ? 'finance-reconcile-ok' : 'finance-reconcile-warn'}`,
		});
		const sign = delta > 0 ? '+' : '';
		deltaEl.setText(`Écart prévu : ${sign}${formatCurrency(delta, account.currency, this.settings.dateFormat)}`);
	}

	onOpen(): void {
		const account = this.store.getAccount(this.accountId);
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', {
			text: this.snapshot.id ? 'Modifier le solde réel' : 'Ajouter un solde réel',
		});
		contentEl.createEl('p', {
			text: `Compte : ${account?.name ?? '—'}`,
			cls: 'finance-modal-subtitle',
		});

		addDatePickerSetting(
			contentEl,
			'Date du relevé',
			this.snapshot.date ?? '',
			v => {
				this.snapshot.date = v;
				this.updatePreview();
			},
			{ desc: 'Date à laquelle le solde a été relevé sur votre banque' },
		);

		new Setting(contentEl)
			.setName('Solde réel')
			.setDesc('Montant affiché sur le relevé à cette date')
			.addText(text => text
				.setValue(String(this.snapshot.actualBalance ?? 0))
				.onChange(v => {
					this.snapshot.actualBalance = parseFloat(v.replace(',', '.')) || 0;
					this.updatePreview();
				}));

		new Setting(contentEl)
			.setName('Note')
			.setDesc('Optionnel — ex. « Relevé en ligne », « Fin de mois »')
			.addText(text => text
				.setValue(this.snapshot.note ?? '')
				.onChange(v => { this.snapshot.note = v; }));

		this.previewEl = contentEl.createDiv({ cls: 'finance-reconcile-preview' });
		this.updatePreview();

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Enregistrer', cls: 'mod-cta' })
			.addEventListener('click', async () => {
				if (!this.snapshot.date) return;
				await this.store.upsertBalanceSnapshot(this.accountId, {
					id: this.snapshot.id,
					date: this.snapshot.date,
					actualBalance: this.snapshot.actualBalance ?? 0,
					note: this.snapshot.note?.trim() || undefined,
				});
				this.onSave();
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

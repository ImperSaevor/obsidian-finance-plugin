import { App, Modal, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { Account, AccountType } from '../types';
import type { FinancePluginSettings } from '../settings';
import { getAccountBalanceReconciliation, getAccountSnapshotCount } from '../utils/calculations';
import { formatCurrency } from '../utils/format';
import { BalanceSnapshotModal } from './balance-snapshot-modal';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
	{ value: 'checking', label: 'Courant' },
	{ value: 'savings', label: 'Épargne' },
	{ value: 'credit', label: 'Crédit' },
	{ value: 'cash', label: 'Espèces' },
	{ value: 'investment', label: 'Investissement' },
	{ value: 'other', label: 'Autre' },
];

import { CATEGORY_COLORS, pickNextColor } from '../utils/colors';

const COLORS = CATEGORY_COLORS;

export class AccountModal extends Modal {
	private account: Partial<Account>;
	private onSave: () => void;
	private reconcilePreviewEl: HTMLElement | null = null;

	constructor(
		app: App,
		private store: FinanceStore,
		private settings: FinancePluginSettings,
		account: Account | null,
		onSave: () => void,
		private onOpenReconciliation?: (accountId: string) => void,
	) {
		super(app);
		this.onSave = onSave;
		this.account = account
			? { ...account }
			: {
				name: '',
				type: 'checking',
				currency: settings.defaultCurrency,
				initialBalance: 0,
				color: pickNextColor(store.getAccounts().map(a => a.color)),
			};
	}

	private updateReconcilePreview(): void {
		if (!this.reconcilePreviewEl || !this.account.id) return;

		const draft: Account = {
			id: this.account.id,
			name: this.account.name ?? '',
			type: this.account.type ?? 'checking',
			currency: this.account.currency ?? this.settings.defaultCurrency,
			initialBalance: this.account.initialBalance ?? 0,
			actualBalance: this.account.actualBalance,
			balanceSnapshots: this.account.balanceSnapshots,
			color: this.account.color ?? COLORS[0],
			createdAt: this.account.createdAt ?? '',
		};

		const rec = getAccountBalanceReconciliation(draft, this.store.getTransactions());
		const currency = draft.currency;
		const snapCount = getAccountSnapshotCount(draft);

		this.reconcilePreviewEl.empty();
		this.reconcilePreviewEl.createDiv({
			text: `Solde calculé : ${formatCurrency(rec.calculated, currency, this.settings.dateFormat)}`,
			cls: 'finance-reconcile-line',
		});
		this.reconcilePreviewEl.createDiv({
			text: `${snapCount} point(s) de solde réel enregistré(s)`,
			cls: 'finance-reconcile-line finance-reconcile-muted',
		});

		if (rec.hasActual) {
			this.reconcilePreviewEl.createDiv({
				text: `Dernier réel : ${formatCurrency(rec.actual!, currency, this.settings.dateFormat)}`,
				cls: 'finance-reconcile-line',
			});
			const deltaEl = this.reconcilePreviewEl.createDiv({
				cls: `finance-reconcile-line ${rec.isReconciled ? 'finance-reconcile-ok' : 'finance-reconcile-warn'}`,
			});
			if (rec.isReconciled) {
				deltaEl.setText('Écart : aucun');
			} else {
				const sign = rec.delta! > 0 ? '+' : '';
				deltaEl.setText(`Écart : ${sign}${formatCurrency(rec.delta!, currency, this.settings.dateFormat)}`);
			}
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.account.id ? 'Modifier le compte' : 'Nouveau compte' });

		new Setting(contentEl)
			.setName('Nom')
			.addText(text => text
				.setValue(this.account.name ?? '')
				.onChange(v => { this.account.name = v; }));

		new Setting(contentEl)
			.setName('Type')
			.addDropdown(drop => {
				for (const t of ACCOUNT_TYPES) {
					drop.addOption(t.value, t.label);
				}
				drop.setValue(this.account.type ?? 'checking');
				drop.onChange(v => { this.account.type = v as AccountType; });
			});

		new Setting(contentEl)
			.setName('Devise')
			.addText(text => text
				.setValue(this.account.currency ?? this.settings.defaultCurrency)
				.onChange(v => { this.account.currency = v; }));

		new Setting(contentEl)
			.setName('Solde initial')
			.setDesc('Point de départ pour le calcul du solde (date de début du suivi)')
			.addText(text => text
				.setValue(String(this.account.initialBalance ?? 0))
				.onChange(v => {
					this.account.initialBalance = parseFloat(v) || 0;
					this.updateReconcilePreview();
				}));

		if (this.account.id) {
			const reconcileSetting = new Setting(contentEl)
				.setName('Soldes réels')
				.setDesc('Saisissez le montant de votre relevé bancaire à différentes dates pour comparer avec le calcul du plugin');

			reconcileSetting.addButton(btn => btn
				.setButtonText('+ Solde réel')
				.onClick(() => {
					new BalanceSnapshotModal(
						this.app,
						this.store,
						this.settings,
						this.account.id!,
						null,
						() => {
							const updated = this.store.getAccount(this.account.id!);
							if (updated) this.account = { ...updated };
							this.updateReconcilePreview();
							this.onSave();
						},
					).open();
				}));

			if (this.onOpenReconciliation) {
				reconcileSetting.addButton(btn => btn
					.setButtonText('Onglet réconciliation')
					.onClick(() => {
						this.onOpenReconciliation?.(this.account.id!);
						this.close();
					}));
			}

			this.reconcilePreviewEl = contentEl.createDiv({ cls: 'finance-reconcile-preview' });
			this.updateReconcilePreview();
		}

		new Setting(contentEl)
			.setName('Couleur')
			.addDropdown(drop => {
				for (const c of COLORS) {
					drop.addOption(c, c);
				}
				drop.setValue(this.account.color ?? COLORS[0]);
				drop.onChange(v => { this.account.color = v; });
			});

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Enregistrer', cls: 'mod-cta' })
			.addEventListener('click', async () => {
				if (!this.account.name?.trim()) return;
				if (this.account.id) {
					await this.store.updateAccount(this.account as Account);
				} else {
					await this.store.addAccount({
						name: this.account.name!,
						type: this.account.type as AccountType,
						currency: this.account.currency ?? this.settings.defaultCurrency,
						initialBalance: this.account.initialBalance ?? 0,
						color: this.account.color ?? COLORS[0],
					});
				}
				this.onSave();
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

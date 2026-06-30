import { App, Modal, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { Account, AccountType } from '../types';
import type { FinancePluginSettings } from '../settings';

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

	constructor(
		app: App,
		private store: FinanceStore,
		private settings: FinancePluginSettings,
		account: Account | null,
		onSave: () => void,
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
			.addText(text => text
				.setValue(String(this.account.initialBalance ?? 0))
				.onChange(v => { this.account.initialBalance = parseFloat(v) || 0; }));

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

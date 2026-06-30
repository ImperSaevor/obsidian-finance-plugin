import { App, Modal, Notice, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { FinancePluginSettings } from '../settings';
import type { ForecastFrequency, RecurringTransaction, TransactionType } from '../types';
import { getCategoriesForAccount } from '../utils/categories';
import { todayISO } from '../utils/format';
import { addDatePickerSetting } from '../utils/date-input';

const FREQUENCIES: { value: ForecastFrequency; label: string }[] = [
	{ value: 'once', label: 'Une fois' },
	{ value: 'weekly', label: 'Hebdomadaire' },
	{ value: 'monthly', label: 'Mensuelle' },
	{ value: 'yearly', label: 'Annuelle' },
];

export class RecurringModal extends Modal {
	private item: Partial<RecurringTransaction>;
	private onSave: () => void;

	constructor(
		app: App,
		private store: FinanceStore,
		private settings: FinancePluginSettings,
		recurring: RecurringTransaction | null,
		defaultAccountId: string | null,
		onSave: () => void,
	) {
		super(app);
		this.onSave = onSave;
		this.item = recurring
			? { ...recurring, tags: [...recurring.tags] }
			: {
				accountId: defaultAccountId ?? '',
				description: '',
				amount: 0,
				type: 'expense' as TransactionType,
				frequency: 'monthly',
				startDate: todayISO(),
				tags: [],
			};
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.store.getAccounts();
		contentEl.empty();
		contentEl.createEl('h2', { text: this.item.id ? 'Modifier la récurrence' : 'Nouvelle transaction récurrente' });

		new Setting(contentEl).setName('Description').addText(t => t
			.setValue(this.item.description ?? '')
			.onChange(v => { this.item.description = v; }));

		new Setting(contentEl).setName('Compte').addDropdown(drop => {
			for (const a of accounts) drop.addOption(a.id, a.name);
			drop.setValue(this.item.accountId ?? '');
			drop.onChange(v => { this.item.accountId = v; });
		});

		new Setting(contentEl).setName('Type').addDropdown(drop => {
			drop.addOption('expense', 'Dépense');
			drop.addOption('income', 'Revenu');
			drop.setValue(this.item.type ?? 'expense');
			drop.onChange(v => { this.item.type = v as TransactionType; });
		});

		new Setting(contentEl).setName('Montant').addText(t => t
			.setValue(String(Math.abs(this.item.amount ?? 0)))
			.onChange(v => { this.item.amount = parseFloat(v) || 0; }));

		new Setting(contentEl).setName('Fréquence').addDropdown(drop => {
			for (const f of FREQUENCIES) drop.addOption(f.value, f.label);
			drop.setValue(this.item.frequency ?? 'monthly');
			drop.onChange(v => { this.item.frequency = v as ForecastFrequency; });
		});

		addDatePickerSetting(contentEl, 'Début', this.item.startDate ?? todayISO(), (v) => {
			this.item.startDate = v;
		});

		addDatePickerSetting(contentEl, 'Fin (optionnel)', this.item.endDate ?? '', (v) => {
			this.item.endDate = v || undefined;
		}, { allowEmpty: true });

		const cats = getCategoriesForAccount(this.store.getCategories(), this.item.accountId ?? '');
		new Setting(contentEl).setName('Catégorie').addDropdown(drop => {
			drop.addOption('', '— Aucune —');
			for (const c of cats) drop.addOption(c.id, c.name);
			drop.setValue(this.item.categoryId ?? '');
			drop.onChange(v => { this.item.categoryId = v || undefined; });
		});

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Enregistrer', cls: 'mod-cta' })
			.addEventListener('click', async () => {
				if (!this.item.description?.trim() || !this.item.accountId) {
					new Notice('Description et compte requis.');
					return;
				}
				const payload = {
					accountId: this.item.accountId,
					description: this.item.description,
					amount: this.item.amount ?? 0,
					type: this.item.type ?? 'expense',
					frequency: this.item.frequency ?? 'monthly',
					startDate: this.item.startDate ?? todayISO(),
					endDate: this.item.endDate,
					categoryId: this.item.categoryId,
					tags: this.item.tags ?? [],
					lastGeneratedDate: this.item.lastGeneratedDate,
				};
				if (this.item.id) {
					await this.store.updateRecurring({ ...payload, id: this.item.id } as RecurringTransaction);
				} else {
					await this.store.addRecurring(payload);
				}
				this.onSave();
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

import { App, Modal, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { Forecast, ForecastFrequency } from '../types';
import { todayISO } from '../utils/format';
import { addDatePickerSetting } from '../utils/date-input';
import { getCategoriesForAccount } from '../utils/categories';

export class ForecastModal extends Modal {
	private forecast: Partial<Forecast>;
	private onSave: () => void;

	constructor(
		app: App,
		private store: FinanceStore,
		forecast: Forecast | null,
		defaultAccountId: string | null,
		onSave: () => void,
	) {
		super(app);
		this.onSave = onSave;
		this.forecast = forecast
			? { ...forecast }
			: {
				accountId: defaultAccountId ?? '',
				description: '',
				amount: 0,
				frequency: 'monthly' as ForecastFrequency,
				startDate: todayISO(),
			};
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.store.getAccounts();
		const accountId = this.forecast.accountId ?? '';
		const categories = accountId
			? getCategoriesForAccount(this.store.getCategories(), accountId)
			: this.store.getCategories();

		contentEl.empty();
		contentEl.createEl('h2', { text: this.forecast.id ? 'Modifier la prévision' : 'Nouvelle prévision' });

		new Setting(contentEl)
			.setName('Compte')
			.addDropdown(drop => {
				for (const a of accounts) drop.addOption(a.id, a.name);
				if (this.forecast.accountId) drop.setValue(this.forecast.accountId);
				drop.onChange(v => {
					this.forecast.accountId = v;
					this.forecast.categoryId = undefined;
					this.onOpen();
				});
			});

		new Setting(contentEl)
			.setName('Description')
			.addText(text => text
				.setValue(this.forecast.description ?? '')
				.onChange(v => { this.forecast.description = v; }));

		new Setting(contentEl)
			.setName('Montant')
			.setDesc('Positif = revenu prévu, négatif = dépense prévue')
			.addText(text => text
				.setValue(String(this.forecast.amount ?? 0))
				.onChange(v => { this.forecast.amount = parseFloat(v) || 0; }));

		new Setting(contentEl)
			.setName('Fréquence')
			.addDropdown(drop => {
				drop.addOption('once', 'Une fois');
				drop.addOption('weekly', 'Hebdomadaire');
				drop.addOption('monthly', 'Mensuelle');
				drop.addOption('yearly', 'Annuelle');
				drop.setValue(this.forecast.frequency ?? 'monthly');
				drop.onChange(v => { this.forecast.frequency = v as ForecastFrequency; });
			});

		addDatePickerSetting(contentEl, 'Date de début', this.forecast.startDate ?? todayISO(), (v) => {
			this.forecast.startDate = v;
		});

		addDatePickerSetting(contentEl, 'Date de fin (optionnel)', this.forecast.endDate ?? '', (v) => {
			this.forecast.endDate = v || undefined;
		}, { allowEmpty: true, desc: 'Laisser vide pour une prévision sans fin' });

		new Setting(contentEl)
			.setName('Catégorie')
			.addDropdown(drop => {
				drop.addOption('', '— Aucune —');
				for (const c of categories) drop.addOption(c.id, c.name);
				drop.setValue(this.forecast.categoryId ?? '');
				drop.onChange(v => { this.forecast.categoryId = v || undefined; });
			});

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Enregistrer', cls: 'mod-cta' })
			.addEventListener('click', async () => {
				if (!this.forecast.accountId || !this.forecast.description?.trim()) return;
				if (this.forecast.id) {
					await this.store.updateForecast(this.forecast as Forecast);
				} else {
					await this.store.addForecast({
						accountId: this.forecast.accountId,
						description: this.forecast.description,
						amount: this.forecast.amount ?? 0,
						frequency: this.forecast.frequency as ForecastFrequency,
						startDate: this.forecast.startDate ?? todayISO(),
						endDate: this.forecast.endDate,
						categoryId: this.forecast.categoryId,
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

import { App, Modal, Notice, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { FinancePluginSettings } from '../settings';
import type { Transaction, TransactionCalcLink, TransactionType } from '../types';
import { getCategoriesForAccount } from '../utils/categories';
import { todayISO } from '../utils/format';
import { addDatePickerSetting } from '../utils/date-input';
import { renderCalculationLinksEditor } from './calculation-links-ui';
import { renderValidationErrors, validateTransaction } from '../utils/transaction-validation';

export class CalculatedTransactionModal extends Modal {
	private accountId: string;
	private date: string;
	private description: string;
	private type: TransactionType = 'expense';
	private links: TransactionCalcLink[];
	private categoryId?: string;
	private tags: string[] = [];
	private validationEl?: HTMLElement;
	private saveBtn?: HTMLButtonElement;

	constructor(
		app: App,
		private store: FinanceStore,
		private settings: FinancePluginSettings,
		sourceTransactions: Transaction[],
		private onSave: () => void,
	) {
		super(app);
		const first = sourceTransactions[0];
		this.accountId = first?.accountId ?? store.getAccounts()[0]?.id ?? '';
		this.date = todayISO();
		this.description = sourceTransactions.length === 1
			? `Calcul : ${first.description}`
			: `Calcul (${sourceTransactions.length} transactions)`;

		this.links = sourceTransactions.map((tx, i) => ({
			transactionId: tx.id,
			operator: i === 0 ? 'add' : 'add',
			useAbsolute: true,
		}));
	}

	private refreshValidation(): void {
		if (!this.validationEl || !this.saveBtn) return;
		const validation = validateTransaction(
			{
				accountId: this.accountId,
				date: this.date,
				description: this.description,
				type: this.type,
				amount: 0,
			},
			{
				useCalculated: true,
				calcLinks: this.links,
				accounts: this.store.getAccounts(),
				allTransactions: this.store.getTransactions(),
			},
		);
		renderValidationErrors(this.validationEl, validation.errors);
		this.saveBtn.disabled = !validation.valid;
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.store.getAccounts();
		const allTx = this.store.getTransactions();
		const account = accounts.find(a => a.id === this.accountId);
		const currency = account?.currency ?? this.settings.defaultCurrency;

		contentEl.empty();
		contentEl.createEl('h2', { text: 'Transaction calculée par liens' });
		contentEl.createEl('p', {
			text: 'Le montant sera calculé automatiquement à partir des transactions liées et se mettra à jour si elles changent.',
			cls: 'finance-modal-hint',
		});

		new Setting(contentEl)
			.setName('Compte')
			.addDropdown(drop => {
				for (const a of accounts) drop.addOption(a.id, a.name);
				drop.setValue(this.accountId);
				drop.onChange(v => { this.accountId = v; this.onOpen(); });
			});

		new Setting(contentEl)
			.setName('Type')
			.addDropdown(drop => {
				drop.addOption('expense', 'Dépense');
				drop.addOption('income', 'Revenu');
				drop.setValue(this.type);
				drop.onChange(v => { this.type = v as TransactionType; this.onOpen(); });
			});

		addDatePickerSetting(contentEl, 'Date', this.date, (v) => {
			this.date = v;
			this.refreshValidation();
		});

		new Setting(contentEl)
			.setName('Description')
			.addText(text => text.setValue(this.description).onChange(v => {
				this.description = v;
				this.refreshValidation();
			}));

		const categories = getCategoriesForAccount(this.store.getCategories(), this.accountId);
		new Setting(contentEl)
			.setName('Catégorie')
			.addDropdown(drop => {
				drop.addOption('', '— Aucune —');
				for (const c of categories) drop.addOption(c.id, c.name);
				drop.setValue(this.categoryId ?? '');
				drop.onChange(v => { this.categoryId = v || undefined; });
			});

		renderCalculationLinksEditor(
			contentEl,
			allTx,
			this.links,
			true,
			undefined,
			currency,
			this.settings.dateFormat,
			(links, _useCalculated) => {
				this.links = links;
				this.refreshValidation();
			},
			this.type,
		);

		const validationEl = contentEl.createDiv({ cls: 'finance-validation' });
		this.validationEl = validationEl;

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		const saveBtn = btnRow.createEl('button', { text: 'Créer', cls: 'mod-cta' });
		this.saveBtn = saveBtn;
		this.refreshValidation();
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		saveBtn.addEventListener('click', async () => {
			const check = validateTransaction(
				{
					accountId: this.accountId,
					date: this.date,
					description: this.description,
					type: this.type,
					amount: 0,
				},
				{
					useCalculated: true,
					calcLinks: this.links,
					accounts,
					allTransactions: allTx,
				},
			);
			if (!check.valid) {
				renderValidationErrors(validationEl, check.errors);
				new Notice(check.errors[0] ?? 'Impossible de créer la transaction.');
				return;
			}
			await this.store.addTransaction({
				accountId: this.accountId,
				date: this.date,
				amount: 0,
				description: this.description,
				categoryId: this.categoryId,
				tags: this.tags,
				type: this.type,
				useCalculatedAmount: true,
				calculationLinks: [...this.links],
			});
			this.onSave();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

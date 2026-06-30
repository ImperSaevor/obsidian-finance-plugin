import { App, Modal, Notice, Setting } from 'obsidian';
import type { FinanceStore } from '../store/finance-store';
import type { FinancePluginSettings } from '../settings';
import type { Transaction, TransactionCalcLink, TransactionType } from '../types';
import { getAllTags } from '../utils/calculations';
import { getCategoriesForAccount } from '../utils/categories';
import { addDatePickerSetting } from '../utils/date-input';
import { todayISO } from '../utils/format';
import { getNoteDisplayName, openNoteAtPath } from '../utils/note-links';
import { renderCalculationLinksEditor } from './calculation-links-ui';
import { NoteSuggestModal } from './note-suggest-modal';
import { renderValidationErrors, validateTransaction } from '../utils/transaction-validation';

export class TransactionModal extends Modal {
	private tx: Partial<Transaction>;
	private onSave: () => void;
	private useCalculated: boolean;
	private calcLinks: TransactionCalcLink[];
	private validationEl?: HTMLElement;
	private saveBtn?: HTMLButtonElement;

	constructor(
		app: App,
		private store: FinanceStore,
		private settings: FinancePluginSettings,
		transaction: Transaction | null,
		defaultAccountId: string | null,
		onSave: () => void,
		initialNotePath?: string,
	) {
		super(app);
		this.onSave = onSave;
		this.tx = transaction
			? { ...transaction, tags: [...transaction.tags] }
			: {
				accountId: defaultAccountId ?? '',
				date: todayISO(),
				amount: 0,
				description: '',
				tags: [],
				type: 'expense' as TransactionType,
				notePath: initialNotePath,
			};
		this.useCalculated = this.tx.useCalculatedAmount ?? false;
		this.calcLinks = this.tx.calculationLinks ? [...this.tx.calculationLinks] : [];
	}

	private refreshValidation(): void {
		if (!this.validationEl || !this.saveBtn) return;
		const validation = validateTransaction(this.tx, {
			useCalculated: this.useCalculated && this.tx.type !== 'transfer',
			calcLinks: this.calcLinks,
			accounts: this.store.getAccounts(),
			allTransactions: this.store.getTransactions(),
			currentTxId: this.tx.id,
		});
		renderValidationErrors(this.validationEl, validation.errors);
		this.saveBtn.disabled = !validation.valid;
		if (validation.valid) {
			this.saveBtn.removeAttribute('title');
		} else {
			this.saveBtn.setAttr('title', validation.errors.join(' '));
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		const accounts = this.store.getAccounts();
		const accountId = this.tx.accountId ?? '';
		const account = accounts.find(a => a.id === accountId);
		const currency = account?.currency ?? this.settings.defaultCurrency;
		const categories = accountId
			? getCategoriesForAccount(this.store.getCategories(), accountId)
			: this.store.getCategories();
		const allTags = getAllTags(this.store.getTransactions());
		const allTx = this.store.getTransactions();

		contentEl.empty();
		contentEl.createEl('h2', { text: this.tx.id ? 'Modifier la transaction' : 'Nouvelle transaction' });

		new Setting(contentEl)
			.setName('Compte')
			.addDropdown(drop => {
				for (const a of accounts) drop.addOption(a.id, a.name);
				if (accountId) drop.setValue(accountId);
				drop.onChange(v => {
					this.tx.accountId = v;
					if (this.tx.categoryId) {
						const cat = this.store.getCategories().find(c => c.id === this.tx.categoryId);
						if (cat?.accountId && cat.accountId !== v) {
							this.tx.categoryId = undefined;
						}
					}
					this.onOpen();
				});
			});

		new Setting(contentEl)
			.setName('Type')
			.addDropdown(drop => {
				drop.addOption('income', 'Revenu');
				drop.addOption('expense', 'Dépense');
				drop.addOption('transfer', 'Transfert');
				drop.setValue(this.tx.type ?? 'expense');
				drop.onChange(v => {
					this.tx.type = v as TransactionType;
					this.onOpen();
				});
			});

		if (this.tx.type === 'transfer') {
			new Setting(contentEl)
				.setName('Compte destination')
				.addDropdown(drop => {
					for (const a of accounts) {
						if (a.id !== this.tx.accountId) drop.addOption(a.id, a.name);
					}
					if (this.tx.transferToAccountId) drop.setValue(this.tx.transferToAccountId);
					drop.onChange(v => {
						this.tx.transferToAccountId = v;
						this.refreshValidation();
					});
				});
		}

		addDatePickerSetting(contentEl, 'Date', this.tx.date ?? todayISO(), (v) => {
			this.tx.date = v;
			this.refreshValidation();
		});

		if (this.tx.type !== 'transfer') {
			renderCalculationLinksEditor(
				contentEl,
				allTx,
				this.calcLinks,
				this.useCalculated,
				this.tx.id,
				currency,
				this.settings.dateFormat,
				(links, useCalculated) => {
					const toggled = this.useCalculated !== useCalculated;
					this.calcLinks = links;
					this.useCalculated = useCalculated;
					if (toggled) this.onOpen();
					else this.refreshValidation();
				},
				this.tx.type ?? 'expense',
			);
		}

		if (!this.useCalculated || this.tx.type === 'transfer') {
			new Setting(contentEl)
				.setName('Montant')
				.addText(text => text
					.setValue(String(Math.abs(this.tx.amount ?? 0)))
					.onChange(v => {
						this.tx.amount = parseFloat(v) || 0;
						this.refreshValidation();
					}));
		}

		new Setting(contentEl)
			.setName('Description')
			.addText(text => text
				.setValue(this.tx.description ?? '')
				.onChange(v => {
					this.tx.description = v;
					this.refreshValidation();
				}));

		if (this.tx.type !== 'transfer') {
			new Setting(contentEl)
				.setName('Catégorie')
				.addDropdown(drop => {
					drop.addOption('', '— Aucune —');
					for (const c of categories) {
						const prefix = c.parentId ? '  └ ' : '';
						const scope = c.accountId ? '' : ' [global]';
						drop.addOption(c.id, prefix + c.name + scope);
					}
					drop.setValue(this.tx.categoryId ?? '');
					drop.onChange(v => { this.tx.categoryId = v || undefined; });
				});
		}

		new Setting(contentEl)
			.setName('Tags (séparés par virgule)')
			.addText(text => text
				.setPlaceholder(allTags.slice(0, 5).join(', '))
				.setValue((this.tx.tags ?? []).join(', '))
				.onChange(v => {
					this.tx.tags = v.split(',').map(t => t.trim()).filter(Boolean);
				}));

		const noteSetting = new Setting(contentEl)
			.setName('Note Obsidian liée')
			.setDesc('Lien vers une note du coffre (backlinks et graphe Obsidian)');
		noteSetting.addText(text => {
			text.inputEl.classList.add('finance-note-path-input');
			text.setPlaceholder('Choisir une note…')
				.setValue(this.tx.notePath ? getNoteDisplayName(this.tx.notePath) : '')
				.setDisabled(true);
		});
		noteSetting.addButton(btn => btn
			.setButtonText('Choisir')
			.onClick(() => {
				new NoteSuggestModal(this.app, (path) => {
					this.tx.notePath = path;
					this.onOpen();
				}).open();
			}));
		if (this.tx.notePath) {
			noteSetting.addButton(btn => btn
				.setButtonText('Ouvrir')
				.onClick(() => openNoteAtPath(this.app, this.tx.notePath!)));
			noteSetting.addButton(btn => btn
				.setButtonText('Retirer')
				.onClick(() => {
					this.tx.notePath = undefined;
					this.onOpen();
				}));
		}

		const validationEl = contentEl.createDiv({ cls: 'finance-validation' });
		this.validationEl = validationEl;

		const btnRow = contentEl.createDiv({ cls: 'finance-modal-buttons' });
		const saveBtn = btnRow.createEl('button', { text: 'Enregistrer', cls: 'mod-cta' });
		this.saveBtn = saveBtn;
		this.refreshValidation();
		btnRow.createEl('button', { text: 'Annuler', cls: 'mod-warning' })
			.addEventListener('click', () => this.close());
		saveBtn.addEventListener('click', async () => {
			const check = validateTransaction(this.tx, {
				useCalculated: this.useCalculated && this.tx.type !== 'transfer',
				calcLinks: this.calcLinks,
				accounts,
				allTransactions: allTx,
				currentTxId: this.tx.id,
			});
			if (!check.valid) {
				renderValidationErrors(validationEl, check.errors);
				new Notice(check.errors[0] ?? 'Impossible d\'enregistrer la transaction.');
				return;
			}

			const payload: Omit<Transaction, 'id'> & { id?: string } = {
				...this.tx as Transaction,
				useCalculatedAmount: this.useCalculated && this.tx.type !== 'transfer',
				calculationLinks: this.useCalculated ? [...this.calcLinks] : undefined,
			};

			if (!payload.useCalculatedAmount) {
				payload.calculationLinks = undefined;
			}

			if (this.tx.id) {
				await this.store.updateTransaction({ ...payload, id: this.tx.id } as Transaction);
			} else {
				await this.store.addTransaction(payload as Omit<Transaction, 'id'>);
			}
			this.onSave();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

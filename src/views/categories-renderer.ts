import type FinancePlugin from '../../main';
import { CategoryModal } from '../modals/category-modal';
import {
	getAccountCategories,
	getChildCategories,
	getGlobalCategories,
	getRootCategories,
} from '../utils/categories';
import { confirmAction } from '../utils/confirm';
import { createCollapse } from '../utils/collapse';

export function renderCategoriesTab(
	el: HTMLElement,
	plugin: FinancePlugin,
	selectedAccountId: string | null,
	refresh: () => void,
): void {
	const store = plugin.store;
	const accounts = store.getAccounts();
	const categories = store.getCategories();
	const transactions = store.getTransactions();

	const toolbar = el.createDiv({ cls: 'finance-toolbar' });
	toolbar.createEl('button', { text: '+ Catégorie globale', cls: 'mod-cta' })
		.addEventListener('click', () => {
			new CategoryModal(plugin.app, store, null, refresh).open();
		});
	if (accounts.length > 0) {
		toolbar.createEl('button', { text: '+ Catégorie de compte' })
			.addEventListener('click', () => {
				const accountId = selectedAccountId ?? accounts[0]?.id;
				new CategoryModal(plugin.app, store, null, refresh, undefined, accountId).open();
			});
	}

	if (categories.length === 0 && accounts.length === 0) {
		el.createEl('p', { text: 'Aucune catégorie.', cls: 'finance-empty' });
		return;
	}

	const renderCategoryTree = (
		parent: HTMLElement,
		pool: typeof categories,
		accountId: string | null,
	): void => {
		const tree = parent.createDiv({ cls: 'finance-category-tree' });
		const renderCategory = (category: typeof categories[0], depth: number): void => {
			const txCount = transactions.filter(t => t.categoryId === category.id).length;
			const item = tree.createDiv({ cls: 'finance-category-item' });
			item.style.paddingLeft = `${depth * 20}px`;

			item.createSpan({ cls: 'finance-legend-color' }).style.backgroundColor = category.color;
			item.createSpan({ text: category.name, cls: 'finance-category-name' });
			item.createSpan({ text: `${txCount} tx`, cls: 'finance-category-count' });

			const actions = item.createDiv({ cls: 'finance-card-actions' });
			actions.createEl('button', { text: 'Modifier' })
				.addEventListener('click', () => {
					new CategoryModal(plugin.app, store, category, refresh).open();
				});
			actions.createEl('button', { text: '+ Sous-cat.' })
				.addEventListener('click', () => {
					new CategoryModal(plugin.app, store, null, refresh, category.id, category.accountId).open();
				});
			actions.createEl('button', { text: '✕', cls: 'mod-warning' })
				.addEventListener('click', async () => {
					const msg = txCount > 0
						? `Supprimer « ${category.name} » ? ${txCount} transaction(s) seront décatégorisées.`
						: `Supprimer « ${category.name} » ?`;
					if (await confirmAction(plugin.app, 'Supprimer la catégorie', msg)) {
						await store.deleteCategory(category.id);
						refresh();
					}
				});

			for (const child of getChildCategories(category.id, pool, accountId)) {
				renderCategory(child, depth + 1);
			}
		};

		for (const root of getRootCategories(pool, accountId)) {
			renderCategory(root, 0);
		}

		if (getRootCategories(pool, accountId).length === 0) {
			tree.createEl('p', { text: 'Aucune catégorie.', cls: 'finance-empty' });
		}
	};

	const globalCats = getGlobalCategories(categories);
	if (globalCats.length > 0 || accounts.length === 0) {
		const globalBody = createCollapse(el, 'Catégories globales', { open: true });
		renderCategoryTree(globalBody, globalCats, null);
	}

	for (const account of accounts) {
		const accountCats = getAccountCategories(categories, account.id);
		const body = createCollapse(
			el,
			`Catégories — ${account.name}`,
			{ open: false, badge: String(accountCats.length) },
		);
		body.parentElement!.style.borderLeftColor = account.color;

		const sectionToolbar = body.createDiv({ cls: 'finance-card-actions' });
		sectionToolbar.createEl('button', { text: '+ Catégorie pour ce compte' })
			.addEventListener('click', () => {
				new CategoryModal(plugin.app, store, null, refresh, undefined, account.id).open();
			});

		const combined = [...getGlobalCategories(categories), ...accountCats];
		renderCategoryTree(body, combined, account.id);
	}

	const allTags = new Map<string, number>();
	for (const tx of transactions) {
		for (const tag of tx.tags) {
			allTags.set(tag, (allTags.get(tag) ?? 0) + 1);
		}
	}
	if (allTags.size > 0) {
		const tagsBody = createCollapse(el, 'Tags utilisés', { open: false });
		const tagCloud = tagsBody.createDiv({ cls: 'finance-tag-cloud' });
		for (const [tag, count] of allTags) {
			tagCloud.createSpan({ text: `${tag} (${count})`, cls: 'finance-tag' });
		}
	}
}

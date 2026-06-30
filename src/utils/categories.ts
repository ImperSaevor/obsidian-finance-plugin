import type { Category } from '../types';

/** Catégories globales + catégories du compte donné */
export function getCategoriesForAccount(categories: Category[], accountId: string): Category[] {
	return categories.filter(c => !c.accountId || c.accountId === accountId);
}

export function getGlobalCategories(categories: Category[]): Category[] {
	return categories.filter(c => !c.accountId);
}

export function getAccountCategories(categories: Category[], accountId: string): Category[] {
	return categories.filter(c => c.accountId === accountId);
}

export function getRootCategories(categories: Category[], accountId?: string | null): Category[] {
	const pool = accountId ? getCategoriesForAccount(categories, accountId) : categories;
	const ids = new Set(pool.map(c => c.id));
	return pool.filter(c => !c.parentId || !ids.has(c.parentId));
}

export function getChildCategories(categoryId: string, categories: Category[], accountId?: string | null): Category[] {
	const pool = accountId ? getCategoriesForAccount(categories, accountId) : categories;
	return pool.filter(c => c.parentId === categoryId);
}

export function categoryBelongsToAccount(category: Category, accountId: string): boolean {
	return !category.accountId || category.accountId === accountId;
}

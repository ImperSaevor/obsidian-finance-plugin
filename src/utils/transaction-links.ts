import { App, TFile, normalizePath } from 'obsidian';
import type FinancePlugin from '../../main';

export const FINANCE_TX_LINK_PREFIX = 'finance-tx:';
export const FINANCE_TX_MARKER_PREFIX = '<!-- finance-tx:';

const TX_ID_PATTERN = /finance-tx:([a-zA-Z0-9_-]+)/;

export async function openTransaction(
	plugin: FinancePlugin,
	txId: string,
	onRefresh?: () => void,
): Promise<void> {
	const tx = plugin.store.getTransaction(txId);
	if (!tx) return;

	const { TransactionModal } = await import('../modals/transaction-modal');
	await plugin.activateView();
	new TransactionModal(
		plugin.app,
		plugin.store,
		plugin.settings,
		tx,
		null,
		onRefresh ?? (() => plugin.activateView()),
	).open();
}

export function enhanceFinanceTxLinks(el: HTMLElement, plugin: FinancePlugin): void {
	el.querySelectorAll(`a[href^="${FINANCE_TX_LINK_PREFIX}"]`).forEach(anchor => {
		const href = anchor.getAttribute('href') ?? '';
		const id = href.slice(FINANCE_TX_LINK_PREFIX.length);
		if (!id) return;
		anchor.addClass('finance-tx-link', 'internal-link');
		anchor.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			void openTransaction(plugin, id);
		});
	});

	el.querySelectorAll('li').forEach(li => {
		if (li.querySelector('.finance-tx-link')) return;
		const html = li.innerHTML;
		const match = html.match(TX_ID_PATTERN);
		if (!match) return;

		const id = match[1];
		const text = li.textContent?.replace(/<!--.*?-->/g, '').trim() ?? '';
		li.empty();
		const link = li.createEl('a', {
			cls: 'finance-tx-link internal-link',
			text: text || 'Voir la transaction',
			href: `${FINANCE_TX_LINK_PREFIX}${id}`,
		});
		link.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			void openTransaction(plugin, id);
		});
	});
}

export function renderTransactionOpenLink(
	parent: HTMLElement,
	plugin: FinancePlugin,
	tx: { id: string; description: string },
	onRefresh?: () => void,
): void {
	const link = parent.createEl('a', {
		cls: 'internal-link finance-tx-link',
		text: tx.description,
		href: `${FINANCE_TX_LINK_PREFIX}${tx.id}`,
	});
	link.addEventListener('click', (e) => {
		e.preventDefault();
		void openTransaction(plugin, tx.id, onRefresh);
	});
}

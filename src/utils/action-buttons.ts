export function renderActionButton(
	bar: HTMLElement,
	icon: string,
	title: string,
	onClick: (() => void) | null,
	options: { warning?: boolean } = {},
): void {
	const btn = bar.createEl('button', {
		cls: options.warning ? 'finance-action-btn mod-warning' : 'finance-action-btn',
	});
	btn.textContent = icon;
	btn.setAttr('title', title);
	btn.setAttr('aria-label', title);
	btn.setAttribute('type', 'button');
	if (!onClick) {
		btn.addClass('finance-action-btn--placeholder');
		return;
	}
	btn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		onClick();
	});
}

export function createActionBar(parent: HTMLElement): HTMLElement {
	return parent.createDiv({ cls: 'finance-action-bar' });
}

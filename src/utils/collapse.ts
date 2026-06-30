export interface CollapseOptions {
	open?: boolean;
	cls?: string;
	badge?: string;
}

export function createCollapse(parent: HTMLElement, title: string, options: CollapseOptions = {}): HTMLElement {
	const details = parent.createEl('details', {
		cls: `finance-collapse ${options.cls ?? ''}`.trim(),
	});
	if (options.open === true) {
		details.open = true;
	} else if (options.open === false) {
		details.open = false;
	}

	const summary = details.createEl('summary', { cls: 'finance-collapse-summary' });
	summary.createSpan({ text: title, cls: 'finance-collapse-title' });
	if (options.badge) {
		summary.createSpan({ text: options.badge, cls: 'finance-collapse-badge' });
	}

	return details.createDiv({ cls: 'finance-collapse-body' });
}

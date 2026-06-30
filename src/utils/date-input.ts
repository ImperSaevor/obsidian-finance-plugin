import { Setting } from 'obsidian';

/** Normalise une valeur en format `YYYY-MM-DD` pour `<input type="date">`. */
export function toDateInputValue(value: string | undefined): string {
	if (!value) return '';
	const trimmed = value.trim();
	if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
	return trimmed;
}

export interface DatePickerOptions {
	desc?: string;
	/** Autorise une valeur vide (ex. date de fin optionnelle). */
	allowEmpty?: boolean;
}

/** Ajoute un champ date natif (datepicker) dans une modale ou un formulaire. */
export function addDatePickerSetting(
	containerEl: HTMLElement,
	name: string,
	value: string,
	onChange: (isoDate: string) => void,
	options: DatePickerOptions = {},
): Setting {
	const setting = new Setting(containerEl).setName(name);
	if (options.desc) setting.setDesc(options.desc);

	setting.addText(text => {
		const input = text.inputEl;
		input.type = 'date';
		input.classList.add('finance-date-input');
		input.value = toDateInputValue(value);
		input.addEventListener('change', () => {
			const v = input.value;
			if (!v && !options.allowEmpty) return;
			onChange(v);
		});
	});

	return setting;
}

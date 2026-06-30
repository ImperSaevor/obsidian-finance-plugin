export const CATEGORY_COLORS = [
	'#4a9eff', '#50c878', '#ff6b6b', '#ffd93d', '#a78bfa', '#f472b6', '#38bdf8',
	'#20c997', '#ff922b', '#e64980', '#94d82d', '#748ffc',
];

export function pickNextColor(usedColors: string[]): string {
	const used = new Set(usedColors.map(c => c.trim().toLowerCase()));
	for (const color of CATEGORY_COLORS) {
		if (!used.has(color.toLowerCase())) return color;
	}
	return `hsl(${(used.size * 47) % 360}, 65%, 55%)`;
}

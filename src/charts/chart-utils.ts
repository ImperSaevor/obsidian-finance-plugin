import type { CategoryBreakdown } from '../utils/calculations';

const CHART_PALETTE = [
	'#4a9eff', '#ff6b6b', '#51cf66', '#fcc419', '#845ef7',
	'#20c997', '#ff922b', '#e64980', '#339af0', '#94d82d',
	'#748ffc', '#f783ac', '#63e6be', '#ffd43b', '#9775fa',
];

interface ThemeColors {
	background: string;
	textMuted: string;
	textNormal: string;
	border: string;
	textFaint: string;
}

function normalizeColor(color: string): string {
	return color.trim().toLowerCase();
}

/** Assigne des couleurs distinctes lorsque plusieurs catégories partagent la même couleur. */
export function assignDistinctColors(colors: string[]): string[] {
	const used = new Set<string>();
	const result: string[] = [];
	let paletteIndex = 0;

	for (const color of colors) {
		const normalized = normalizeColor(color);
		if (!used.has(normalized)) {
			used.add(normalized);
			result.push(color);
			continue;
		}

		while (
			paletteIndex < CHART_PALETTE.length
			&& used.has(normalizeColor(CHART_PALETTE[paletteIndex]))
		) {
			paletteIndex++;
		}

		const fallback = paletteIndex < CHART_PALETTE.length
			? CHART_PALETTE[paletteIndex++]
			: `hsl(${(result.length * 47) % 360}, 65%, 55%)`;
		used.add(normalizeColor(fallback));
		result.push(fallback);
	}

	return result;
}

function getThemeColors(el: HTMLElement): ThemeColors {
	const style = getComputedStyle(el);
	return {
		background: style.getPropertyValue('--background-primary').trim() || '#1e1e1e',
		textMuted: style.getPropertyValue('--text-muted').trim() || '#999',
		textNormal: style.getPropertyValue('--text-normal').trim() || '#ccc',
		border: style.getPropertyValue('--background-modifier-border').trim() || '#444',
		textFaint: style.getPropertyValue('--text-faint').trim() || '#666',
	};
}

function setupCanvas(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
): CanvasRenderingContext2D | null {
	const w = Math.max(1, width);
	const h = Math.max(1, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	const dpr = window.devicePixelRatio || 1;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	canvas.style.width = `${w}px`;
	canvas.style.height = `${h}px`;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return ctx;
}

function getChartWidth(canvas: HTMLCanvasElement, fallback = 400): number {
	const raw = canvas.parentElement?.clientWidth ?? fallback;
	if (raw < 48) return 0;
	return Math.max(200, raw);
}

function clampRadius(radius: number, max = 4): number {
	return Math.max(0, Math.min(max, radius));
}

export interface PieChartOptions {
	colors?: string[];
	centerLabel?: string;
	centerSubLabel?: string;
	size?: number;
	highlightController?: { setHighlight: (index: number | null) => void };
}

interface PieSlice {
	startAngle: number;
	endAngle: number;
	item: CategoryBreakdown;
	color: string;
}

function getPieSlices(
	breakdown: CategoryBreakdown[],
	colors: string[],
): { slices: PieSlice[]; total: number } {
	const total = breakdown.reduce((s, b) => s + b.total, 0);
	let startAngle = -Math.PI / 2;
	const slices: PieSlice[] = [];

	for (let i = 0; i < breakdown.length; i++) {
		const item = breakdown[i];
		const sliceAngle = (item.total / total) * 2 * Math.PI;
		slices.push({
			startAngle,
			endAngle: startAngle + sliceAngle,
			item,
			color: colors[i],
		});
		startAngle += sliceAngle;
	}

	return { slices, total };
}

function drawPieSlices(
	ctx: CanvasRenderingContext2D,
	slices: PieSlice[],
	cx: number,
	cy: number,
	radius: number,
	innerRadius: number,
	theme: ThemeColors,
	highlightIndex: number | null,
): void {
	for (let i = 0; i < slices.length; i++) {
		const slice = slices[i];
		const isHighlight = highlightIndex === i;
		const isDimmed = highlightIndex !== null && !isHighlight;
		const midAngle = (slice.startAngle + slice.endAngle) / 2;
		const offset = isHighlight ? 6 : 0;
		const ox = Math.cos(midAngle) * offset;
		const oy = Math.sin(midAngle) * offset;

		ctx.beginPath();
		ctx.moveTo(cx + ox, cy + oy);
		ctx.arc(cx + ox, cy + oy, radius, slice.startAngle, slice.endAngle);
		ctx.closePath();
		ctx.fillStyle = slice.color;
		ctx.globalAlpha = isDimmed ? 0.35 : 1;
		ctx.fill();
		ctx.globalAlpha = 1;

		ctx.strokeStyle = theme.background;
		ctx.lineWidth = 2;
		ctx.stroke();
	}

	// Trou central
	ctx.beginPath();
	ctx.arc(cx, cy, innerRadius, 0, 2 * Math.PI);
	ctx.fillStyle = theme.background;
	ctx.fill();
}

function drawPieCenter(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	theme: ThemeColors,
	centerLabel?: string,
	centerSubLabel?: string,
): void {
	if (!centerLabel && !centerSubLabel) return;

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	if (centerLabel) {
		ctx.fillStyle = theme.textNormal;
		ctx.font = '600 14px var(--font-interface, sans-serif)';
		ctx.fillText(centerLabel, cx, cy - (centerSubLabel ? 8 : 0));
	}
	if (centerSubLabel) {
		ctx.fillStyle = theme.textMuted;
		ctx.font = '11px var(--font-interface, sans-serif)';
		ctx.fillText(centerSubLabel, cx, cy + 10);
	}
}

function normalizeAngle(angle: number): number {
	return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

function findSliceAtAngle(slices: PieSlice[], angle: number): number {
	const a = normalizeAngle(angle);
	for (let i = 0; i < slices.length; i++) {
		const start = normalizeAngle(slices[i].startAngle);
		let end = normalizeAngle(slices[i].endAngle);
		if (end <= start) end += 2 * Math.PI;
		let test = a;
		if (test < start) test += 2 * Math.PI;
		if (test >= start && test < end) return i;
	}
	return -1;
}

const pieChartHandlers = new WeakMap<HTMLCanvasElement, { onMove: (e: MouseEvent) => void; onLeave: () => void }>();

export function drawPieChart(
	canvas: HTMLCanvasElement,
	breakdown: CategoryBreakdown[],
	options: PieChartOptions = {},
): void {
	if (breakdown.length === 0) return;

	const parentWidth = canvas.parentElement?.clientWidth ?? 0;
	if (parentWidth > 0 && parentWidth < 48) return;

	const colors = options.colors ?? assignDistinctColors(breakdown.map(b => b.color));
	const size = options.size ?? Math.max(80, Math.min(parentWidth || 320, 260));
	const ctx = setupCanvas(canvas, size, size);
	if (!ctx) return;

	const theme = getThemeColors(canvas);
	const cx = size / 2;
	const cy = size / 2;
	const radius = Math.max(8, size / 2 - 16);
	const innerRadius = Math.max(4, radius * 0.55);
	const { slices } = getPieSlices(breakdown, colors);

	let highlightIndex: number | null = null;

	const redraw = () => {
		ctx.clearRect(0, 0, size, size);
		drawPieSlices(ctx, slices, cx, cy, radius, innerRadius, theme, highlightIndex);
		drawPieCenter(ctx, cx, cy, theme, options.centerLabel, options.centerSubLabel);
	};

	const onMove = (e: MouseEvent) => {
		const rect = canvas.getBoundingClientRect();
		const scale = size / rect.width;
		const x = (e.clientX - rect.left) * scale - cx;
		const y = (e.clientY - rect.top) * scale - cy;
		const dist = Math.sqrt(x * x + y * y);
		if (dist < innerRadius || dist > radius + 8) {
			if (highlightIndex !== null) {
				highlightIndex = null;
				canvas.style.cursor = 'default';
				redraw();
			}
			return;
		}
		const idx = findSliceAtAngle(slices, Math.atan2(y, x));
		if (idx !== highlightIndex) {
			highlightIndex = idx >= 0 ? idx : null;
			canvas.style.cursor = highlightIndex !== null ? 'pointer' : 'default';
			redraw();
		}
	};

	const onLeave = () => {
		if (highlightIndex !== null) {
			highlightIndex = null;
			canvas.style.cursor = 'default';
			redraw();
		}
	};

	const existing = pieChartHandlers.get(canvas);
	if (existing) {
		canvas.removeEventListener('mousemove', existing.onMove);
		canvas.removeEventListener('mouseleave', existing.onLeave);
	}
	pieChartHandlers.set(canvas, { onMove, onLeave });
	canvas.addEventListener('mousemove', onMove);
	canvas.addEventListener('mouseleave', onLeave);

	if (options.highlightController) {
		options.highlightController.setHighlight = (index: number | null) => {
			highlightIndex = index;
			redraw();
		};
	}

	redraw();
}

function drawHorizontalGrid(
	ctx: CanvasRenderingContext2D,
	padding: { top: number; right: number; bottom: number; left: number },
	chartW: number,
	chartH: number,
	steps: number,
	color: string,
): void {
	ctx.strokeStyle = color;
	ctx.lineWidth = 0.5;
	for (let i = 0; i <= steps; i++) {
		const y = padding.top + (i / steps) * chartH;
		ctx.beginPath();
		ctx.moveTo(padding.left, y);
		ctx.lineTo(padding.left + chartW, y);
		ctx.stroke();
	}
}

function formatAxisValue(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (abs >= 10_000) return `${(value / 1_000).toFixed(0)}k`;
	if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
	return value.toFixed(0);
}

export function drawLineChart(
	canvas: HTMLCanvasElement,
	labels: string[],
	values: number[],
	color = '#4a9eff',
): void {
	const width = getChartWidth(canvas);
	if (!width || values.length === 0) return;

	const ctx = setupCanvas(canvas, width, 220);
	if (!ctx) return;

	const height = 220;
	const theme = getThemeColors(canvas);
	const padding = { top: 24, right: 24, bottom: 36, left: 64 };
	const chartW = width - padding.left - padding.right;
	const chartH = height - padding.top - padding.bottom;

	const minVal = Math.min(...values);
	const maxVal = Math.max(...values);
	const range = maxVal - minVal || 1;
	const gridSteps = 4;

	drawHorizontalGrid(ctx, padding, chartW, chartH, gridSteps, theme.border);

	// Axe Y
	ctx.strokeStyle = theme.textFaint;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(padding.left, padding.top);
	ctx.lineTo(padding.left, padding.top + chartH);
	ctx.lineTo(padding.left + chartW, padding.top + chartH);
	ctx.stroke();

	// Labels axe Y
	ctx.fillStyle = theme.textMuted;
	ctx.font = '10px var(--font-interface, sans-serif)';
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	for (let i = 0; i <= gridSteps; i++) {
		const val = maxVal - (i / gridSteps) * range;
		const y = padding.top + (i / gridSteps) * chartH;
		ctx.fillText(formatAxisValue(val), padding.left - 8, y);
	}

	// Remplissage sous la courbe
	const points: { x: number; y: number }[] = [];
	for (let i = 0; i < values.length; i++) {
		const x = padding.left + (i / Math.max(values.length - 1, 1)) * chartW;
		const y = padding.top + chartH - ((values[i] - minVal) / range) * chartH;
		points.push({ x, y });
	}

	const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
	gradient.addColorStop(0, color + '40');
	gradient.addColorStop(1, color + '05');
	ctx.beginPath();
	ctx.moveTo(points[0].x, padding.top + chartH);
	for (const p of points) ctx.lineTo(p.x, p.y);
	ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
	ctx.closePath();
	ctx.fillStyle = gradient;
	ctx.fill();

	// Ligne
	ctx.strokeStyle = color;
	ctx.lineWidth = 2.5;
	ctx.lineJoin = 'round';
	ctx.beginPath();
	for (let i = 0; i < points.length; i++) {
		if (i === 0) ctx.moveTo(points[i].x, points[i].y);
		else ctx.lineTo(points[i].x, points[i].y);
	}
	ctx.stroke();

	// Points
	for (const p of points) {
		ctx.beginPath();
		ctx.arc(p.x, p.y, 3.5, 0, 2 * Math.PI);
		ctx.fillStyle = theme.background;
		ctx.fill();
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.stroke();
	}

	// Labels axe X
	ctx.fillStyle = theme.textMuted;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	const step = Math.max(1, Math.floor(labels.length / 6));
	for (let i = 0; i < labels.length; i += step) {
		const x = padding.left + (i / Math.max(labels.length - 1, 1)) * chartW;
		const label = labels[i].length >= 7 ? labels[i].slice(5) : labels[i];
		ctx.fillText(label, x, padding.top + chartH + 8);
	}
}

export function drawBarChart(
	canvas: HTMLCanvasElement,
	labels: string[],
	values: number[],
	colors: string[],
): void {
	const width = getChartWidth(canvas);
	if (!width || values.length === 0) return;

	const ctx = setupCanvas(canvas, width, 220);
	if (!ctx) return;

	const height = 220;
	const theme = getThemeColors(canvas);
	const distinctColors = assignDistinctColors(colors);
	const padding = { top: 28, right: 20, bottom: 44, left: 20 };
	const chartW = width - padding.left - padding.right;
	const chartH = height - padding.top - padding.bottom;
	const gap = Math.min(8, Math.max(2, chartW / values.length / 4));
	const barWidth = Math.max(2, (chartW - gap * (values.length - 1)) / values.length);
	const maxVal = Math.max(...values.map(Math.abs), 1);
	const gridSteps = 4;

	drawHorizontalGrid(ctx, padding, chartW, chartH, gridSteps, theme.border);

	ctx.strokeStyle = theme.textFaint;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(padding.left, padding.top + chartH);
	ctx.lineTo(padding.left + chartW, padding.top + chartH);
	ctx.stroke();

	for (let i = 0; i < values.length; i++) {
		const barH = (Math.abs(values[i]) / maxVal) * chartH;
		const x = padding.left + i * (barWidth + gap);
		const y = padding.top + chartH - barH;
		const barColor = distinctColors[i] ?? '#4a9eff';
		const radius = clampRadius(barWidth / 4);

		ctx.fillStyle = barColor;
		if (radius > 0 && barWidth >= 6) {
			ctx.beginPath();
			ctx.moveTo(x, y + radius);
			ctx.arcTo(x, y, x + radius, y, radius);
			ctx.arcTo(x + barWidth, y, x + barWidth, y + radius, radius);
			ctx.lineTo(x + barWidth, padding.top + chartH);
			ctx.lineTo(x, padding.top + chartH);
			ctx.closePath();
			ctx.fill();
		} else {
			ctx.fillRect(x, y, barWidth, barH);
		}

		// Valeur au-dessus de la barre
		if (barH > 16) {
			ctx.fillStyle = theme.textNormal;
			ctx.font = '10px var(--font-interface, sans-serif)';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'bottom';
			ctx.fillText(formatAxisValue(values[i]), x + barWidth / 2, y - 4);
		}

		ctx.fillStyle = theme.textMuted;
		ctx.font = '10px var(--font-interface, sans-serif)';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		const label = labels[i].length > 10 ? labels[i].slice(0, 9) + '…' : labels[i];
		ctx.fillText(label, x + barWidth / 2, padding.top + chartH + 8);
	}
}

export function drawFlowChart(
	canvas: HTMLCanvasElement,
	labels: string[],
	income: number[],
	expense: number[],
): void {
	const width = getChartWidth(canvas);
	if (!width || labels.length === 0) return;

	const ctx = setupCanvas(canvas, width, 240);
	if (!ctx) return;

	const height = 240;
	const theme = getThemeColors(canvas);
	const padding = { top: 28, right: 20, bottom: 44, left: 56 };
	const chartW = width - padding.left - padding.right;
	const chartH = height - padding.top - padding.bottom;
	const gap = Math.min(10, Math.max(2, chartW / labels.length / 5));
	const groupW = Math.max(8, (chartW - gap * (labels.length - 1)) / labels.length);
	const barW = Math.max(2, groupW / 2 - 2);
	const maxVal = Math.max(...income, ...expense, 1);
	const gridSteps = 4;

	drawHorizontalGrid(ctx, padding, chartW, chartH, gridSteps, theme.border);

	for (let i = 0; i < labels.length; i++) {
		const x0 = padding.left + i * (groupW + gap);
		for (const [val, color, offset] of [
			[income[i], '#51cf66', 0],
			[expense[i], '#ff6b6b', barW + 2],
		] as const) {
			const barH = (val / maxVal) * chartH;
			const x = x0 + offset;
			const y = padding.top + chartH - barH;
			ctx.fillStyle = color;
			ctx.fillRect(x, y, barW, barH);
		}

		ctx.fillStyle = theme.textMuted;
		ctx.font = '9px var(--font-interface, sans-serif)';
		ctx.textAlign = 'center';
		ctx.fillText(labels[i].slice(5), x0 + groupW / 2, padding.top + chartH + 8);
	}

	ctx.fillStyle = theme.textMuted;
	ctx.font = '10px var(--font-interface, sans-serif)';
	ctx.textAlign = 'left';
	ctx.fillText('■ Revenus', padding.left, 14);
	ctx.fillStyle = '#ff6b6b';
	ctx.fillText('■ Dépenses', padding.left + 80, 14);
}

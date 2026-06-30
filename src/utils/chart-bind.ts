export function bindResponsiveChart(canvas: HTMLCanvasElement, draw: () => void): () => void {
	const target = canvas.parentElement ?? canvas;
	let timer: number | undefined;

	const safeDraw = () => {
		const w = canvas.parentElement?.clientWidth ?? 0;
		if (w > 0 && w < 48) return;
		draw();
	};

	const observer = new ResizeObserver(() => {
		window.clearTimeout(timer);
		timer = window.setTimeout(safeDraw, 80);
	});
	observer.observe(target);
	requestAnimationFrame(safeDraw);
	return () => {
		window.clearTimeout(timer);
		observer.disconnect();
	};
}

export function bindPieLegend(
	legendItems: HTMLElement[],
	onHighlight: (index: number | null) => void,
): void {
	for (let i = 0; i < legendItems.length; i++) {
		const item = legendItems[i];
		const idx = i;
		item.addEventListener('mouseenter', () => {
			onHighlight(idx);
			legendItems.forEach((el, j) => el.toggleClass('finance-legend-active', j === idx));
		});
		item.addEventListener('mouseleave', () => {
			onHighlight(null);
			legendItems.forEach(el => el.removeClass('finance-legend-active'));
		});
	}
}

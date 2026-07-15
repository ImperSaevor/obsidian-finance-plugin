import type FinancePlugin from '../../main';
import { BalanceSnapshotModal } from '../modals/balance-snapshot-modal';
import { drawDeltaBarChart, drawMultiLineChart } from '../charts/chart-utils';
import { bindResponsiveChart } from '../utils/chart-bind';
import { createCollapse } from '../utils/collapse';
import { confirmAction } from '../utils/confirm';
import { formatCurrency, formatDate } from '../utils/format';
import {
	analyzeReconciliationGaps,
	getReconciliationChartSeries,
	getAccountBalanceAtDate,
	normalizeAccountSnapshots,
} from '../utils/reconciliation';
import { getAccountBalanceReconciliation } from '../utils/calculations';

export function renderReconciliationTab(
	el: HTMLElement,
	plugin: FinancePlugin,
	selectedAccountId: string | null,
	onAccountChange: (id: string | null) => void,
	refresh: () => void,
): void {
	const store = plugin.store;
	const settings = plugin.settings;
	const accounts = store.getAccounts();
	const transactions = store.getTransactions();

	if (accounts.length === 0) {
		el.createEl('p', { text: 'Créez un compte pour utiliser la réconciliation.', cls: 'finance-empty' });
		return;
	}

	const toolbar = el.createDiv({ cls: 'finance-toolbar' });
	const filterRow = toolbar.createDiv({ cls: 'finance-filter-row' });
	filterRow.createSpan({ text: 'Compte : ' });
	const select = filterRow.createEl('select');
	const accountId = selectedAccountId ?? accounts[0].id;
	for (const a of accounts) {
		const opt = select.createEl('option', { text: a.name, value: a.id });
		if (a.id === accountId) opt.selected = true;
	}
	select.addEventListener('change', () => onAccountChange(select.value || null));

	const account = accounts.find(a => a.id === accountId)!;
	toolbar.createEl('button', { text: '+ Solde réel', cls: 'mod-cta' })
		.addEventListener('click', () => {
			new BalanceSnapshotModal(plugin.app, store, settings, accountId, null, refresh).open();
		});

	const rec = getAccountBalanceReconciliation(account, transactions);
	const analysis = analyzeReconciliationGaps(account, transactions);
	const snapshots = normalizeAccountSnapshots(account);

	const summary = el.createDiv({ cls: 'finance-reconcile-summary-panel' });
	const summaryGrid = summary.createDiv({ cls: 'finance-overview-stats' });

	const calcStat = summaryGrid.createDiv({ cls: 'finance-overview-stat' });
	calcStat.style.borderLeftColor = account.color;
	calcStat.createEl('div', { text: 'Solde calculé', cls: 'finance-overview-stat-label' });
	calcStat.createEl('div', {
		text: formatCurrency(rec.calculated, account.currency, settings.dateFormat),
		cls: `finance-overview-stat-value ${rec.calculated >= 0 ? 'positive' : 'negative'}`,
	});

	const realStat = summaryGrid.createDiv({ cls: 'finance-overview-stat' });
	realStat.style.borderLeftColor = account.color;
	realStat.createEl('div', { text: 'Dernier solde réel', cls: 'finance-overview-stat-label' });
	realStat.createEl('div', {
		text: rec.hasActual
			? formatCurrency(rec.actual!, account.currency, settings.dateFormat)
			: '—',
		cls: 'finance-overview-stat-value',
	});

	const deltaStat = summaryGrid.createDiv({ cls: 'finance-overview-stat' });
	deltaStat.style.borderLeftColor = account.color;
	deltaStat.createEl('div', { text: 'Écart actuel', cls: 'finance-overview-stat-label' });
	deltaStat.createEl('div', {
		text: rec.hasActual
			? `${rec.delta! >= 0 ? '+' : ''}${formatCurrency(rec.delta!, account.currency, settings.dateFormat)}`
			: '—',
		cls: `finance-overview-stat-value ${rec.isReconciled ? 'finance-reconcile-ok' : 'finance-reconcile-warn'}`,
	});

	const chartSection = createCollapse(el, 'Comparaison calculé vs réel', {
		open: true,
		badge: `${snapshots.length} point(s)`,
	});

	const series = getReconciliationChartSeries(account, transactions);
	if (series.length > 0) {
		const compareCanvas = chartSection.createEl('canvas', { cls: 'finance-chart finance-reconcile-chart' });
		const actualByDate = new Map(
			snapshots.map(s => [s.date, s.actualBalance]),
		);
		const actualSeries = series.map(p => actualByDate.get(p.date) ?? null);

		const drawCompare = () => drawMultiLineChart(
			compareCanvas,
			series.map(p => p.date),
			[
				{
					label: 'Calculé',
					values: series.map(p => p.calculated),
					color: account.color,
				},
				{
					label: 'Réel',
					values: actualSeries,
					color: '#fcc419',
					dashed: true,
				},
			],
		);
		bindResponsiveChart(compareCanvas, drawCompare);

		const deltaPoints = series.filter(p => p.delta !== undefined);
		if (deltaPoints.length > 0) {
			chartSection.createEl('h4', { text: 'Écarts par date (réel − calculé)' });
			const deltaCanvas = chartSection.createEl('canvas', { cls: 'finance-chart finance-reconcile-delta-chart' });
			const drawDelta = () => drawDeltaBarChart(
				deltaCanvas,
				deltaPoints.map(p => p.date),
				deltaPoints.map(p => p.delta!),
			);
			bindResponsiveChart(deltaCanvas, drawDelta);
		}
	} else {
		chartSection.createEl('p', {
			text: 'Ajoutez un solde réel pour afficher le graphique comparatif.',
			cls: 'finance-empty',
		});
	}

	const snapshotsBody = createCollapse(el, 'Historique des soldes réels', {
		open: true,
		badge: String(snapshots.length),
	});

	if (snapshots.length === 0) {
		snapshotsBody.createEl('p', {
			text: 'Aucun solde réel enregistré. Cliquez sur « + Solde réel » pour saisir le montant de votre relevé bancaire à une date donnée.',
			cls: 'finance-empty',
		});
	} else {
		const table = snapshotsBody.createEl('table', { cls: 'finance-table finance-reconcile-table' });
		const thead = table.createEl('thead');
		const headRow = thead.createEl('tr');
		for (const label of ['Date', 'Réel', 'Calculé', 'Écart', 'Note', 'Actions']) {
			headRow.createEl('th', { text: label });
		}
		const tbody = table.createEl('tbody');
		for (const snap of [...snapshots].reverse()) {
			const calculated = getAccountBalanceAtDate(
				account.id,
				transactions,
				account.initialBalance,
				snap.date,
			);
			const delta = snap.actualBalance - calculated;
			const row = tbody.createEl('tr');
			row.createEl('td', { text: formatDate(snap.date, settings.dateFormat), cls: 'finance-date-col' });
			row.createEl('td', {
				text: formatCurrency(snap.actualBalance, account.currency, settings.dateFormat),
			});
			row.createEl('td', {
				text: formatCurrency(calculated, account.currency, settings.dateFormat),
			});
			const deltaTd = row.createEl('td');
			deltaTd.createSpan({
				text: `${delta >= 0 ? '+' : ''}${formatCurrency(delta, account.currency, settings.dateFormat)}`,
				cls: Math.abs(delta) < 0.005 ? 'finance-reconcile-ok' : 'finance-reconcile-warn',
			});
			row.createEl('td', { text: snap.note ?? '—', cls: snap.note ? '' : 'finance-cell-empty' });

			const actions = row.createEl('td', { cls: 'finance-row-actions' });
			const bar = actions.createDiv({ cls: 'finance-action-bar' });
			const editBtn = bar.createEl('button', { cls: 'finance-action-btn', text: '✎' });
			editBtn.setAttr('title', 'Modifier');
			editBtn.addEventListener('click', () => {
				new BalanceSnapshotModal(plugin.app, store, settings, accountId, snap, refresh).open();
			});
			const delBtn = bar.createEl('button', { cls: 'finance-action-btn mod-warning', text: '✕' });
			delBtn.setAttr('title', 'Supprimer');
			delBtn.addEventListener('click', () => {
				void (async () => {
					if (await confirmAction(
						plugin.app,
						'Supprimer',
						`Supprimer le solde réel du ${formatDate(snap.date, settings.dateFormat)} ?`,
					)) {
						await store.deleteBalanceSnapshot(accountId, snap.id);
						refresh();
					}
				})();
			});
		}
	}

	const analysisBody = createCollapse(el, 'Analyse des écarts', {
		open: analysis.findings.some(f => f.severity === 'warning'),
		badge: String(analysis.findings.length),
	});

	if (analysis.findings.length === 0) {
		analysisBody.createEl('p', { text: 'Aucune anomalie détectée.', cls: 'finance-empty' });
	} else {
		const list = analysisBody.createDiv({ cls: 'finance-findings-list' });
		for (const finding of analysis.findings) {
			const item = list.createDiv({ cls: `finance-finding finance-finding--${finding.severity}` });
			item.createEl('div', { text: finding.title, cls: 'finance-finding-title' });
			item.createEl('div', { text: finding.description, cls: 'finance-finding-desc' });

			if (finding.transactionIds?.length) {
				const txBlock = item.createDiv({ cls: 'finance-finding-tx' });
				txBlock.createSpan({ text: 'Transactions concernées : ', cls: 'finance-finding-tx-label' });
				const shown = finding.transactionIds.slice(0, 8);
				for (const txId of shown) {
					const tx = store.getTransaction(txId);
					if (!tx) continue;
					const chip = txBlock.createEl('button', {
						cls: 'finance-finding-chip',
						text: `${formatDate(tx.date, settings.dateFormat)} · ${tx.description}`,
					});
					chip.addEventListener('click', () => {
						void import('../modals/transaction-modal').then(({ TransactionModal }) => {
							new TransactionModal(
								plugin.app,
								store,
								settings,
								tx,
								tx.accountId,
								refresh,
							).open();
						});
					});
				}
				if (finding.transactionIds.length > shown.length) {
					txBlock.createSpan({
						text: ` +${finding.transactionIds.length - shown.length} autres`,
						cls: 'finance-finding-more',
					});
				}
			}
		}
	}
}

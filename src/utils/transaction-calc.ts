import type { CalcOperator, Transaction, TransactionCalcLink, TransactionType } from '../types';

export const SUM_OPERATORS: CalcOperator[] = [
	'add_percent_of_sum',
	'subtract_percent_of_sum',
	'multiply_sum',
];

export function isSumOperator(op: CalcOperator): boolean {
	return SUM_OPERATORS.includes(op);
}

export function getTransactionAmount(tx: Transaction): number {
	return tx.amount;
}

export function computeLinkedAmount(
	links: TransactionCalcLink[],
	transactions: Transaction[],
	type: TransactionType,
): number {
	if (links.length === 0) return 0;

	const resolve = (id: string): number => {
		const tx = transactions.find(t => t.id === id);
		return tx?.amount ?? 0;
	};

	const first = links[0];
	let result = first.useAbsolute ? Math.abs(resolve(first.transactionId)) : resolve(first.transactionId);
	if (first.factor != null) {
		result *= first.factor;
	}

	for (let i = 1; i < links.length; i++) {
		const link = links[i];
		const factor = link.factor ?? (link.operator === 'percent_of' ? 100 : 1);

		if (isSumOperator(link.operator)) {
			switch (link.operator) {
				case 'add_percent_of_sum':
					result += result * (factor / 100);
					break;
				case 'subtract_percent_of_sum':
					result -= result * (factor / 100);
					break;
				case 'multiply_sum':
					result *= factor;
					break;
			}
			continue;
		}

		let operand = link.useAbsolute
			? Math.abs(resolve(link.transactionId))
			: resolve(link.transactionId);
		if (link.factor != null && link.operator !== 'percent_of') {
			operand *= link.factor;
		}

		switch (link.operator) {
			case 'add':
				result += operand;
				break;
			case 'subtract':
				result -= operand;
				break;
			case 'multiply':
				result *= link.factor ?? operand;
				break;
			case 'percent_of':
				result += (factor / 100) * operand;
				break;
		}
	}

	if (type === 'expense' && result > 0) result = -result;
	if (type === 'income' && result < 0) result = -result;
	return Math.round(result * 100) / 100;
}

export function describeCalculation(
	links: TransactionCalcLink[],
	transactions: Transaction[],
): string {
	if (links.length === 0) return '';

	const label = (id: string) => {
		const tx = transactions.find(t => t.id === id);
		return tx ? tx.description : '?';
	};

	const opSymbol: Record<CalcOperator, string> = {
		add: '+',
		subtract: '−',
		multiply: '×',
		percent_of: '+',
		add_percent_of_sum: '+',
		subtract_percent_of_sum: '−',
		multiply_sum: '×',
	};

	let parts = [`Base : ${label(links[0].transactionId)}`];
	if (links[0].factor != null && links[0].factor !== 1) {
		parts[0] += ` × ${links[0].factor}`;
	}

	for (let i = 1; i < links.length; i++) {
		const link = links[i];
		const factor = link.factor ?? (link.operator === 'percent_of' ? 100 : 1);

		if (link.operator === 'add_percent_of_sum') {
			parts.push(`+ ${factor}% de la somme`);
		} else if (link.operator === 'subtract_percent_of_sum') {
			parts.push(`− ${factor}% de la somme`);
		} else if (link.operator === 'multiply_sum') {
			parts.push(`× ${factor} sur la somme`);
		} else if (link.operator === 'percent_of') {
			parts.push(`+ ${factor}% de ${label(link.transactionId)}`);
		} else {
			let part = `${opSymbol[link.operator]} ${label(link.transactionId)}`;
			if (link.factor != null && link.operator !== 'percent_of') {
				part += ` × ${link.factor}`;
			}
			parts.push(part);
		}
	}

	return parts.join(' ');
}

export function getTransactionsUsingSource(
	sourceId: string,
	transactions: Transaction[],
): Transaction[] {
	return transactions.filter(
		t => t.useCalculatedAmount && t.calculationLinks?.some(l => l.transactionId === sourceId),
	);
}

export function stripInvalidLinks(
	links: TransactionCalcLink[],
	validIds: Set<string>,
): TransactionCalcLink[] {
	return links.filter(l => isSumOperator(l.operator) || validIds.has(l.transactionId));
}

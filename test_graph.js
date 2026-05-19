import { parse_bnf } from './src/lib/grammars/grammar.js';
import { compute_first } from './src/lib/algorithms/algorithms.js';

const g = parse_bnf('S -> A\nA -> aA | a', 'compact');
const first = compute_first(g);

const stateMap = new Map();
let stateItems = 0;
let edges = 0;

function itemKey(item) {
	return `${item.parent}|${item.symbols.join(' ')}|${item.dot}|${item.lookahead || ''}`;
}

const firstProd = g.productions[0];
const startItems = [];
for (const alt of firstProd.children) {
	const symbols = alt.split('');
	startItems.push({ parent: firstProd.parent, symbols, dot: 0, lookahead: '$' });
}

const queue = [];
const visited = new Set();

for (const item of startItems) {
	const key = itemKey(item);
	stateMap.set(key, stateItems++);
	queue.push(key);
}

while (queue.length > 0) {
	const key = queue.shift();
	if (visited.has(key)) continue;
	visited.add(key);

	const parts = key.split('|');
	const syms = parts[1] ? parts[1].split(' ') : [];
	const dot = parseInt(parts[2], 10);
	const sym = dot < syms.length ? syms[dot] : null;

	if (sym === null) continue;

	edges++; // Advance edge
	const advancedKey = `${parts[0]}|${parts[1]}|${dot + 1}|${parts[3]}`;
	if (!stateMap.has(advancedKey)) {
		stateMap.set(advancedKey, stateItems++);
	}
	queue.push(advancedKey);

	if (g.non_terminals.has(sym)) {
		let lookaheads = new Set();
		const beta = syms.slice(dot + 1);
		if (parts[3]) beta.push(parts[3]);

		let allEpsilon = true;
		for (const b of beta) {
			const firstB = first.get(b) || new Set([b]);
			for (const x of firstB) {
				if (x !== 'ε') lookaheads.add(x);
			}
			if (!firstB.has('ε')) {
				allEpsilon = false;
				break;
			}
		}
		if (allEpsilon && parts[3]) lookaheads.add(parts[3]);

		for (const prod of g.productions) {
			if (prod.parent !== sym) continue;
			for (const alt of prod.children) {
				const symbols = alt.split('');
				for (const la of lookaheads) {
					edges++; // Epsilon edge
					const eKey = `${sym}|${symbols.join(' ')}|0|${la}`;
					if (!stateMap.has(eKey)) {
						stateMap.set(eKey, stateItems++);
					}
					queue.push(eKey);
				}
			}
		}
	}
}

console.log(`Nodes: ${stateItems}, Edges: ${edges}`);

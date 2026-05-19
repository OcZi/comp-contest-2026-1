import type { Grammar } from '$lib/grammars/grammar';
import { GrammarError } from '$lib/grammars/grammar_error';

type LL1Conflict = {
	nonTerminal: string;
	terminal: string;
	existing: string[];
	incoming: string[];
};

export function compute_ll1_safe(
	g: Grammar,
	first: Map<string, Set<string>>,
	follow: Map<string, Set<string>>
): { table: Map<string, Map<string, string[]>>; conflicts: LL1Conflict[] } {
	const table = new Map<string, Map<string, string[]>>();
	const conflicts: LL1Conflict[] = [];

	for (const nt of g.non_terminals) table.set(nt, new Map());

	for (const prod of g.productions) {
		const row = table.get(prod.parent)!;

		for (const alt of prod.children) {
			const symbols = g.mode === 'compact' ? alt.split('') : alt.split(' ');
			const firstAlt = new Set<string>();
			let allHaveEpsilon = true;

			for (const sym of symbols) {
				if (sym === 'ε') {
					firstAlt.add('ε');
					break;
				}
				const firstSym = first.get(sym) ?? new Set();
				for (const x of firstSym) if (x !== 'ε') firstAlt.add(x);
				if (!firstSym.has('ε')) {
					allHaveEpsilon = false;
					break;
				}
			}

			if (allHaveEpsilon) firstAlt.add('ε');

			const assign = (t: string, alt: string[]) => {
				if (row.has(t)) {
					conflicts.push({
						nonTerminal: prod.parent,
						terminal: t,
						existing: row.get(t)!,
						incoming: alt
					});
				} else {
					row.set(t, alt);
				}
			};

			for (const t of firstAlt) {
				if (t !== 'ε') assign(t, symbols);
			}

			if (firstAlt.has('ε')) {
				const followA = follow.get(prod.parent) ?? new Set();
				for (const t of followA) assign(t, ['ε']);
			}
		}
	}

	return { table, conflicts };
}

export function compute_ll1(
	g: Grammar,
	first: Map<string, Set<string>>,
	follow: Map<string, Set<string>>
): Map<string, Map<string, string[]>> {
	// tabla[NT][terminal] = producción
	const table = new Map<string, Map<string, string[]>>();

	// inicializar filas
	for (const nt of g.non_terminals) {
		table.set(nt, new Map());
	}

	for (const prod of g.productions) {
		const row = table.get(prod.parent)!;

		for (const alt of prod.children) {
			const symbols = g.mode === 'compact' ? alt.split('') : alt.split(' ');

			// calcular FIRST(alt)
			const firstAlt = new Set<string>();
			let allHaveEpsilon = true;

			for (const sym of symbols) {
				if (sym === 'ε') {
					firstAlt.add('ε');
					break;
				}

				const firstSym = first.get(sym) ?? new Set();
				for (const x of firstSym) {
					if (x !== 'ε') firstAlt.add(x);
				}

				if (!firstSym.has('ε')) {
					allHaveEpsilon = false;
					break;
				}
			}

			if (allHaveEpsilon) firstAlt.add('ε');

			// regla 1: para cada terminal en FIRST(alt)
			// tabla[A][t] = alt
			for (const t of firstAlt) {
				if (t !== 'ε') {
					if (row.has(t)) {
						// conflicto — gramática no es LL(1)
						throw new GrammarError(`Conflicto LL(1): ${prod.parent} -> ${t} ya definido`);
					}
					row.set(t, symbols);
				}
			}

			// regla 2: si ε ∈ FIRST(alt)
			// para cada terminal en FOLLOW(A), tabla[A][t] = ε
			if (firstAlt.has('ε')) {
				const followA = follow.get(prod.parent) ?? new Set();
				for (const t of followA) {
					if (row.has(t)) {
						throw new GrammarError(`Conflicto LL(1): ${prod.parent} -> ${t} ya definido`);
					}
					row.set(t, ['ε']);
				}
			}
		}
	}

	return table;
}

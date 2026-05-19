import type { Grammar } from '$lib/grammars/grammar';
import { EPSILON } from '$lib/grammars/grammar_regex';

// AI STUFF: Replace or fix it without hesitation
// First: probably a O(n**3) is not good, better approach would be: add first char for non terminal
// and check if is a terminal or not
// Follow: I haven't read it yet
export function compute_first(g: Grammar): Map<string, Set<string>> {
	const first = new Map<string, Set<string>>();

	for (const t of g.terminals) first.set(t, new Set([t]));
	for (const nt of g.non_terminals) first.set(nt, new Set());

	let changed = true;
	while (changed) {
		changed = false;

		for (const prod of g.productions) {
			const f = first.get(prod.parent)!;

			for (const alt of prod.children) {
				const symbols = g.mode === 'compact' ? alt.split('') : alt.split(' ');

				let allHaveEpsilon = true;

				for (const sym of symbols) {
					// alternativa es solo ε
					if (sym === EPSILON) {
						if (!f.has(EPSILON)) {
							f.add(EPSILON);
							changed = true;
						}
						allHaveEpsilon = true;
						break;
					}

					const firstSym = first.get(sym) ?? new Set();

					// agrega FIRST(sym) - {ε}
					for (const x of firstSym) {
						if (x !== EPSILON && !f.has(x)) {
							f.add(x);
							changed = true;
						}
					}

					// sym no deriva ε → para
					if (!firstSym.has(EPSILON)) {
						allHaveEpsilon = false;
						break;
					}
				}

				// todos los símbolos derivan ε
				if (allHaveEpsilon) {
					if (!f.has(EPSILON)) {
						f.add(EPSILON);
						changed = true;
					}
				}
			}
		}
	}

	return first;
}

export function compute_follow(
	g: Grammar,
	first: Map<string, Set<string>>
): Map<string, Set<string>> {
	const follow = new Map<string, Set<string>>();

	// inicializar
	for (const nt of g.non_terminals) follow.set(nt, new Set());

	// $ al símbolo inicial
	follow.get(g.productions[0].parent)!.add('$');

	let changed = true;
	while (changed) {
		changed = false;

		for (const prod of g.productions) {
			const followA = follow.get(prod.parent)!;

			for (const alt of prod.children) {
				const symbols = g.mode === 'compact' ? alt.split('') : alt.split(' ');

				for (let i = 0; i < symbols.length; i++) {
					const sym = symbols[i];

					// solo calculamos FOLLOW de no terminales
					if (!g.non_terminals.has(sym)) continue;

					const followSym = follow.get(sym)!;
					const rest = symbols.slice(i + 1); // β después de sym

					// caso 1: calcular FIRST(β)
					let betaHasEpsilon = true;

					for (const b of rest) {
						const firstB = first.get(b) ?? new Set();

						// agrega FIRST(b) - {ε} a FOLLOW(sym)
						for (const x of firstB) {
							if (x !== EPSILON && !followSym.has(x)) {
								followSym.add(x);
								changed = true;
							}
						}

						if (!firstB.has(EPSILON)) {
							betaHasEpsilon = false;
							break;
						}
					}

					// caso 2: β deriva ε o sym es el último símbolo
					// agrega FOLLOW(A) a FOLLOW(sym)
					if (betaHasEpsilon || rest.length === 0) {
						for (const x of followA) {
							if (!followSym.has(x)) {
								followSym.add(x);
								changed = true;
							}
						}
					}
				}
			}
		}
	}

	return follow;
}

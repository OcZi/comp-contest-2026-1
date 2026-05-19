import type { Grammar } from '$lib/grammars/grammar';
import { GrammarError } from '$lib/grammars/grammar_error';
import type { ASTNode } from './parse_types';

export function recursive_descent(
	g: Grammar,
	table: Map<string, Map<string, string[]>>,
	input: string
): ASTNode {
	// tokenizar input según modo
	const tokens =
		g.mode === 'compact'
			? input.split('').filter((c) => c !== ' ')
			: input.split(' ').filter(Boolean);

	tokens.push('$');
	let pos = 0;

	function parse(symbol: string): ASTNode {
		const token = tokens[pos];

		// terminal
		if (g.terminals.has(symbol)) {
			if (symbol !== token) {
				throw new GrammarError(`Error: esperado '${symbol}', encontrado '${token}'`);
			}
			pos++;
			return { symbol, children: [] };
		}

		// no terminal — consultar tabla LL(1)
		const row = table.get(symbol);
		if (!row) throw new GrammarError(`Símbolo desconocido: ${symbol}`);

		const production = row.get(token);
		if (!production) {
			throw new GrammarError(
				`Error en descenso recursivo: no hay producción para ${symbol} con '${token}'`
			);
		}

		const node: ASTNode = { symbol, children: [] };

		// expandir producción
		if (production[0] !== 'ε') {
			for (const sym of production) {
				node.children.push(parse(sym));
			}
		}

		return node;
	}

	const tree = parse(g.productions[0].parent);

	if (tokens[pos] !== '$') {
		throw new GrammarError(`Input no consumido completamente en pos ${pos}`);
	}

	return tree;
}

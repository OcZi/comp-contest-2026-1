import { BNF_REGEX, ARROW_REGEX } from './grammar_regex.ts';
import { GrammarError } from './grammar_error.ts';

export interface Production {
	parent: string;
	children: string[];
}

export type GrammarMode = 'spaced' | 'compact';

export interface Grammar {
	productions: Production[];
	terminals: Set<string>;
	non_terminals: Set<string>;
	tokens: Set<string>;

	mode: GrammarMode;
}

export function tokenize(s: string, tokens: Set<string>, mode: GrammarMode) {
	s.split(mode == 'compact' ? '' : ' ').forEach((c) => {
		if (c != ' ') tokens.add(c);
	});
}

export function prods_to_gram(productions: Production[], mode: GrammarMode): Grammar {
	const non_terminals = new Set<string>();
	const tokens = new Set<string>();
	for (const prod of productions) {
		tokens.add(prod.parent);
		prod.children.forEach((s) => tokenize(s, tokens, mode));

		non_terminals.add(prod.parent);
	}

	const terminals = tokens.difference(non_terminals);
	return { productions, terminals, non_terminals, tokens, mode };
}

export function gram_to_string(ctx: Grammar): string {
	return ctx.productions.map((p) => `${p.parent} -> ${p.children.join('|')}`).join('\n');
}

export function bnf_to_prod(raw: string, mode: GrammarMode): Production {
	if (!raw.match(BNF_REGEX)) throw new GrammarError(`${raw} does not match BNF syntax`);

	// Mode compact: academic
	// S -> A | B ab | D
	// split: ["S", "A | B ab | D"]
	// Mode spaced: syntactically correct
	// S -> A | B a b | D
	const [parent, , r] = raw.split(ARROW_REGEX);
	const children = r
		.split('|')
		.map((p: string) => p.trim().replaceAll(/\s+/g, mode == 'compact' ? '' : ' '));
	return { parent: parent.trim(), children };
}

export function parse_bnf(input: string, mode: GrammarMode): Grammar {
	console.log(input);
	const prods = input
		.replaceAll(';', '\n')
		.split('\n')
		.filter((l) => l.trim().length > 0)
		.map((l) => bnf_to_prod(l.trim(), mode));

	return prods_to_gram(prods, mode);
}

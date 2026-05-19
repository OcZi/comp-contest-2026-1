// types.ts
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

// LR
export interface LR0Item {
	prod: Production;
	alt: string[];
	dot: number;
}

export interface LR1Item {
	prod: Production;
	alt: string[];
	dot: number;
	lookahead: string;
}

export interface LR0State {
	id: number;
	items: LR0Item[];
}

export interface LR1State {
	id: number;
	items: LR1Item[];
}

export type LRAction =
	| { type: 'shift'; state: number }
	| { type: 'reduce'; prod: Production; alt: string[] }
	| { type: 'accept' };

export interface LRTable {
	action: Map<string, LRAction>;
	goto: Map<string, number>;
	conflicts: string[];
}

export interface LR0Automaton {
	states: LR0State[];
	transitions: Map<string, number>;
}

export interface LR1Automaton {
	states: LR1State[];
	transitions: Map<string, number>;
}

// AST
export interface ASTNode {
	symbol: string;
	children: ASTNode[];
}

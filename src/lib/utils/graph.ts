import { Graphviz } from "@hpcc-js/wasm-graphviz";
import type { ASTNode } from "$lib/parser/parse_types";

let graphviz: Graphviz | null = null;

async function getGraphviz(): Promise<Graphviz> {
    if (!graphviz) {
        graphviz = await Graphviz.load();
    }
    return graphviz;
}

export function astToDot(node: ASTNode, parentId?: string): { dot: string; id: number } {
    let id = 0;
    const nodes: string[] = [];
    const edges: string[] = [];

    function traverse(n: ASTNode, parent?: string): string {
        const currentId = `n${id++}`;
        const label = n.symbol === '' ? 'ε' : n.symbol;
        nodes.push(`  ${currentId} [label="${label}"];`);

        if (parent) {
            edges.push(`  ${parent} -> ${currentId};`);
        }

        for (const child of n.children) {
            traverse(child, currentId);
        }

        return currentId;
    }

    traverse(node, parentId);

    const dot = `digraph AST {
  node [shape=box, fontsize=12];
  rankdir=TB;
  bgcolor=transparent;
  graph [bgcolor=transparent];
${nodes.join('\n')}
${edges.join('\n')}
}`;

    return { dot, id };
}

export async function renderAstSvg(node: ASTNode): Promise<string> {
    console.log('--- renderAstSvg called ---');
    console.log('AST:', node);
    
    try {
        const gv = await getGraphviz();
        console.log('Graphviz ready');
        
        const { dot } = astToDot(node);
        console.log('DOT generated:', dot);
        
        const svg = gv.dot(dot);
        console.log('SVG generated, length:', svg.length);
        
        if (!svg || svg.length === 0) {
            throw new Error('Empty SVG returned');
        }
        
        return svg;
    } catch (e) {
        console.error('Error in renderAstSvg:', e);
        return `<svg>Error: ${e}</svg>`;
    }
}

export async function renderAstSvgSync(node: ASTNode): Promise<string> {
    const gv = await getGraphviz();
    const { dot } = astToDot(node);
    return gv.dot(dot);
}

interface LRItem {
    prod: { parent: string; children: string[] };
    alt: string[];
    dot: number;
    lookahead?: string;
}

interface LRState {
    id: number;
    items: LRItem[];
}

function itemToDotString(item: LRItem, showLookahead: boolean = false): string {
    const prodStr = `${item.prod.parent} -> ${item.alt.join('')}`;
    const dotPos = item.dot;
    const before = item.alt.slice(0, dotPos).join('');
    const after = item.alt.slice(dotPos).join('');
    const lookahead = showLookahead && item.lookahead ? `, ${item.lookahead}` : '';
    return `${prodStr} | ${before}·${after}${lookahead}`;
}

function normalizeTransitionKey(key: string): string {
    return key.replace(/,/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
}



export async function renderLL1TableSvg(
    table: Map<string, Map<string, string[]>>,
    nonTerminals: Set<string>,
    terminals: Set<string>,
    title: string = 'LL1_Table'
): Promise<string> {
    try {
        const gv = await getGraphviz();

        const allSymbols = [...terminals, '$'].filter(s => s !== 'ε');
        const sortedTerminals = allSymbols.sort();
        const sortedNonTerminals = [...nonTerminals].sort();

        // Header HTML table
        const headerCells = ['<td border="1" bgcolor="#e0e0e0"><b>NT</b></td>'];
        for (const sym of sortedTerminals) {
            headerCells.push(`<td border="1" bgcolor="#e0e0e0"><b>${sym}</b></td>`);
        }
        const headerHtml = `<table border="0" cellspacing="0" cellpading="2"><tr>${headerCells.join('')}</tr>`;

        let dot = `digraph ${title} {
  bgcolor=transparent;
  graph [bgcolor=transparent];
  node [shape=plain, fontsize=10];
  edge [fontsize=8];
`;

        dot += `  table [label=<${headerHtml}`;

        for (const nt of sortedNonTerminals) {
            const row = table.get(nt);
            const rowCells = [`<td border="1"><b>${nt}</b></td>`];
            
            for (const t of sortedTerminals) {
                const prod = row?.get(t);
                if (prod && prod.length > 0 && prod[0] !== 'ε') {
                    rowCells.push(`<td border="1">${prod.join('')}</td>`);
                } else if (prod && prod[0] === 'ε') {
                    rowCells.push(`<td border="1">ε</td>`);
                } else {
                    rowCells.push(`<td border="1">-</td>`);
                }
            }
            
            dot += `<tr>${rowCells.join('')}</tr>`;
        }

        dot += '</table>>];';

        dot += '}';

        console.log('LL1 Table DOT:', dot);
        const svg = gv.dot(dot);
        if (!svg || svg.length === 0) {
            throw new Error('Empty SVG returned');
        }
        return svg;
    } catch (e) {
        console.error('Error rendering LL1 table:', e);
        return `<svg>Error: ${e}</svg>`;
    }
}

export async function renderLRTableSvg(
    action: Map<string, any>,
    goto: Map<string, number>,
    nonTerminals: Set<string>,
    terminals: Set<string>,
    title: string = 'LR_Table'
): Promise<string> {
    try {
        const gv = await getGraphviz();

        const allTerminals = [...terminals].filter(t => t !== 'ε').sort();
        const allNonTerminals = [...nonTerminals].sort();
        const headerSymbols = [...allTerminals, '$', ...allNonTerminals];

        const stateActions = new Map<number, Map<string, string>>();
        
        for (const [key, act] of action) {
            const [state, sym] = key.split(',');
            const stateNum = parseInt(state);
            if (!stateActions.has(stateNum)) {
                stateActions.set(stateNum, new Map());
            }
            
            let actionStr = '';
            if (act.type === 'shift') {
                actionStr = `s${act.state}`;
            } else if (act.type === 'reduce') {
                actionStr = `r${act.prod.parent}${act.alt.join('')}`;
            } else if (act.type === 'accept') {
                actionStr = 'acc';
            }
            
            stateActions.get(stateNum)!.set(sym, actionStr);
        }

        for (const [key, target] of goto) {
            const [state, sym] = key.split(',');
            const stateNum = parseInt(state);
            if (!stateActions.has(stateNum)) {
                stateActions.set(stateNum, new Map());
            }
            stateActions.get(stateNum)!.set(sym, String(target));
        }

        const sortedStates = [...stateActions.keys()].sort((a, b) => a - b);

        // Header HTML table
        const headerCells = ['<td border="1" bgcolor="#e0e0e0"><b>State</b></td>'];
        for (const sym of headerSymbols) {
            headerCells.push(`<td border="1" bgcolor="#e0e0e0"><b>${sym}</b></td>`);
        }
        const headerHtml = `<table border="0" cellspacing="0" cellpading="2"><tr>${headerCells.join('')}</tr>`;

        let dot = `digraph ${title} {
  bgcolor=transparent;
  graph [bgcolor=transparent];
  node [shape=plain, fontsize=10];
  edge [fontsize=8];
`;

        dot += `  table [label=<${headerHtml}`;

        for (const state of sortedStates) {
            const stateRow = stateActions.get(state)!;
            const rowCells = [`<td border="1"><b>${state}</b></td>`];
            
            for (const sym of headerSymbols) {
                const action = stateRow.get(sym);
                rowCells.push(`<td border="1">${action || '-'}</td>`);
            }
            
            dot += `<tr>${rowCells.join('')}</tr>`;
        }

        dot += '</table>>];';

        dot += '}';

        console.log('LR Table DOT:', dot);
        const svg = gv.dot(dot);
        if (!svg || svg.length === 0) {
            throw new Error('Empty SVG returned');
        }
        return svg;
    } catch (e) {
        console.error('Error rendering LR table:', e);
        return `<svg>Error: ${e}</svg>`;
    }
}

export async function renderAFNItemsSvg(
    states: LRState[],
    transitions: Map<string, number>,
    title: string = 'AFN_Items'
): Promise<string> {
    try {
        const gv = await getGraphviz();

        const hasLookahead = states.some((s: LRState) => 
            s.items?.some((i: LRItem) => i.lookahead)
        ) ?? false;

        const nodes: string[] = [];
        const edges: string[] = [];

        for (const state of states) {
            const itemsStr = state.items
                .map((item: LRItem) => {
                    const prod = `${item.prod.parent}->${item.alt.join('')}`;
                    const dotPos = item.dot;
                    const before = item.alt.slice(0, dotPos).join('');
                    const after = item.alt.slice(dotPos).join('');
                    const la = hasLookahead && item.lookahead ? `,${item.lookahead}` : '';
                    return `${prod}|${before}.${after}${la}`;
                })
                .join('\\\\n');
            
            const label = `S${state.id}\\\\n${itemsStr}`;
            nodes.push(`  S${state.id} [label="${label}", shape=rect, style=rounded, fontsize=8];`);
        }

        for (const [key, target] of transitions) {
            const [from, sym] = key.split(',');
            const isEpsilon = sym === 'ε' || sym === '';
            const style = isEpsilon ? 'style=dashed,color=gray' : '';
            edges.push(`  S${from} -> S${target} [label="${sym}", ${style}];`);
        }

        const dot = `digraph ${title} {
  rankdir=LR;
  bgcolor=transparent;
  graph [bgcolor=transparent];
  node [shape=rect, style=rounded, fontsize=8];
  edge [fontsize=8];
${nodes.join('\n')}
${edges.join('\n')}
}`;

        console.log('AFN DOT:', dot);
        const svg = gv.dot(dot);
        if (!svg || svg.length === 0) {
            throw new Error('Empty SVG returned');
        }
        return svg;
    } catch (e) {
        console.error('Error rendering AFN:', e);
        return `<svg>Error: ${e}</svg>`;
    }
}

export async function renderGotoSvg(
    transitions: Map<string, number>,
    title: string = 'GOTO'
): Promise<string> {
    try {
        const gv = await getGraphviz();
        
        const nodes: string[] = [];
        const edges: string[] = [];
        
        const targetStates = new Set<number>();
        const symbols = new Set<string>();
        
        for (const [key, target] of transitions) {
            const [from, sym] = key.split(',');
            targetStates.add(Number(from));
            targetStates.add(target);
            symbols.add(sym);
        }

        for (const stateId of targetStates) {
            nodes.push(`  "S${stateId}" [label="S${stateId}", shape=circle, fontsize=11];`);
        }

        for (const [key, target] of transitions) {
            const [from, sym] = key.split(',');
            const isEpsilon = sym === 'ε' || sym === '';
            const edgeStyle = isEpsilon ? '[style=dashed, color=gray]' : '';
            edges.push(`  "S${from}" -> "S${target}" [label="${sym}", ${edgeStyle}];`);
        }

        const dot = `digraph ${title} {
  rankdir=LR;
  node [shape=circle, fontsize=11];
  bgcolor=transparent;
  graph [bgcolor=transparent];
${nodes.join('\n')}
${edges.join('\n')}
}`;

        console.log('GOTO DOT:', dot);
        const svg = gv.dot(dot);
        if (!svg || svg.length === 0) {
            throw new Error('Empty SVG returned');
        }
        return svg;
    } catch (e) {
        console.error('Error rendering GOTO:', e);
        return `<svg>Error: ${e}</svg>`;
    }
}
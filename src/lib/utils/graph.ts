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

    function isTerminal(n: ASTNode): boolean {
        return n.children.length === 0;
    }

    function traverse(n: ASTNode, parent?: string): string {
        const currentId = `n${id++}`;
        const label = n.symbol === '' ? 'ε' : n.symbol;

        if (n.symbol === '' || n.symbol === 'ε') {
            // Epsilon node
            nodes.push(`  ${currentId} [label="ε", shape=plaintext, fontsize=11, fontcolor="#999999", fontname="Fira Mono"];`);
        } else if (isTerminal(n)) {
            // Terminal node — green filled ellipse
            nodes.push(`  ${currentId} [label="${label}", shape=ellipse, style=filled, fillcolor="#d4edda", color="#28a745", fontsize=11, fontname="Fira Mono", fontcolor="#155724"];`);
        } else {
            // Non-terminal node — blue rounded box
            nodes.push(`  ${currentId} [label="${label}", shape=box, style="rounded,filled", fillcolor="#d0e4f5", color="#4a90d9", fontsize=12, fontname="Fira Mono", fontcolor="#1a4c7a"];`);
        }

        if (parent) {
            edges.push(`  ${parent} -> ${currentId} [color="#6c757d", arrowsize=0.7];`);
        }

        for (const child of n.children) {
            traverse(child, currentId);
        }

        return currentId;
    }

    traverse(node, parentId);

    const dot = `digraph AST {
  rankdir=TB;
  bgcolor=transparent;
  graph [bgcolor=transparent, pad="0.3", nodesep=0.4, ranksep=0.5];
  node [fontname="Fira Mono"];
  edge [color="#6c757d", arrowsize=0.7];
  labelloc="t";
  label="Abstract Syntax Tree";
  fontname="Fira Mono";
  fontsize=14;
  fontcolor="#495057";
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

        console.log('LR Table DOT:', dot);
        const svg = gv.dot(dot);
        if (!svg || svg.length === 0) {
            throw new Error('Empty SVG returned');
        }
        return svg;
    } catch (e) {
        console.error('Error rendering LR Table:', e);
        return `<svg>Error: ${e}</svg>`;
    }
}

export async function renderClosureAfnSvg(
    g: any,
    title: string = 'AFN_Closure',
    first?: Map<string, Set<string>>
): Promise<string> {
    try {
        const gv = await getGraphviz();

        // Each AFN state is a single item: parent -> symbols with dot position
        // Key: "parent->sym1 sym2 . sym3 sym4"  (dot embedded in the symbol list)
        interface AFNItem {
            parent: string;
            symbols: string[];    // the RHS symbols
            dot: number;          // dot position (0 = before first symbol)
            lookahead?: string;   // optional lookahead for LR(1)
        }

        const mode = g.mode || 'compact';

        function splitRhs(alt: string): string[] {
            return mode === 'compact' ? alt.split('') : alt.split(' ').filter(Boolean);
        }

        function itemKey(item: AFNItem): string {
            return `${item.parent}|${item.symbols.join(' ')}|${item.dot}|${item.lookahead || ''}`;
        }

        function itemLabel(item: AFNItem): string {
            const before = item.symbols.slice(0, item.dot).join('');
            const after = item.symbols.slice(item.dot).join('');
            const la = item.lookahead ? `,${item.lookahead}` : '';
            return `${item.parent} -> ${before}.${after}${la}`;
        }

        function isAccept(item: AFNItem): boolean {
            return item.dot >= item.symbols.length;
        }

        function symbolAfterDot(item: AFNItem): string | null {
            if (item.dot >= item.symbols.length) return null;
            return item.symbols[item.dot];
        }

        // Build all AFN states and transitions
        const stateMap = new Map<string, number>();
        const stateItems: AFNItem[] = [];
        const nodes: string[] = [];
        const edges: string[] = [];

        function getOrCreateState(item: AFNItem): number {
            const key = itemKey(item);
            if (stateMap.has(key)) return stateMap.get(key)!;
            const id = stateItems.length;
            stateMap.set(key, id);
            stateItems.push(item);

            const accept = isAccept(item);
            const label = itemLabel(item).replace(/"/g, '\\"');
            const style = accept
                ? 'shape=rect, style="rounded,filled,bold", fillcolor="#d4edda", color="#28a745", fontcolor="#155724"'
                : 'shape=rect, style="rounded,filled", fillcolor="#f8f9fa", color="#6c757d", fontcolor="#212529"';
            nodes.push(`  S${id} [label="${label}", ${style}, fontsize=10, fontname="Fira Mono"];`);
            return id;
        }

        // Seed: start from the first production's first alternative
        const firstProd = g.productions[0];
        const startItems: AFNItem[] = [];
        for (const alt of firstProd.children) {
            const symbols = splitRhs(alt);
            startItems.push({ parent: firstProd.parent, symbols, dot: 0, lookahead: first ? '$' : undefined });
        }

        // BFS to build the full AFN
        const queue: number[] = [];
        const visited = new Set<number>();

        for (const item of startItems) {
            const id = getOrCreateState(item);
            queue.push(id);
        }

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            const item = stateItems[currentId];
            const sym = symbolAfterDot(item);

            if (sym === null) continue; // accept state, no outgoing

            // 1. Transition on the symbol: advance the dot
            const advancedItem: AFNItem = {
                parent: item.parent,
                symbols: item.symbols,
                dot: item.dot + 1,
                lookahead: item.lookahead,
            };
            const advancedId = getOrCreateState(advancedItem);
            edges.push(`  S${currentId} -> S${advancedId} [label="${sym}", fontsize=10, fontname="Fira Mono", color="#495057"];`);
            queue.push(advancedId);

            // 2. If symbol after dot is a non-terminal, add ε-transitions
            //    to all productions of that non-terminal
            if (g.non_terminals.has(sym)) {
                let lookaheads = new Set<string>();
                if (first) {
                    const beta = [...item.symbols.slice(item.dot + 1)];
                    if (item.lookahead) beta.push(item.lookahead);
                    
                    let allEpsilon = true;
                    for (const b of beta) {
                        const firstB = first.get(b) ?? new Set([b]);
                        for (const x of firstB) {
                            if (x !== 'ε') lookaheads.add(x);
                        }
                        if (!firstB.has('ε')) { allEpsilon = false; break; }
                    }
                    if (allEpsilon && item.lookahead) {
                        lookaheads.add(item.lookahead);
                    }
                } else {
                    lookaheads.add(''); // dummy for LR0
                }

                for (const prod of g.productions) {
                    if (prod.parent !== sym) continue;
                    for (const alt of prod.children) {
                        const symbols = splitRhs(alt);
                        
                        for (const la of lookaheads) {
                            const epsilonItem: AFNItem = {
                                parent: sym,
                                symbols,
                                dot: 0,
                                lookahead: first ? la : undefined,
                            };
                            const epsilonId = getOrCreateState(epsilonItem);
                            edges.push(`  S${currentId} -> S${epsilonId} [label="ε", style=dashed, color="#adb5bd", fontcolor="#adb5bd", fontsize=10, fontname="Fira Mono"];`);
                            queue.push(epsilonId);
                        }
                    }
                }
            }
        }

        const displayTitle = title.replace(/_/g, ' ');
        const dot = `digraph ${title} {
  rankdir=LR;
  bgcolor=transparent;
  graph [bgcolor=transparent, pad="0.3", nodesep=0.5, ranksep=0.6];
  node [shape=rect, style=rounded, fontsize=10, fontname="Fira Mono"];
  edge [fontsize=10, fontname="Fira Mono", color="#495057"];
  labelloc="t";
  label="${displayTitle}";
  fontname="Fira Mono";
  fontsize=14;
  fontcolor="#495057";
${nodes.join('\n')}
${edges.join('\n')}
}`;

        console.log('AFN Closure DOT:', dot);
        const svg = gv.dot(dot);
        if (!svg || svg.length === 0) {
            throw new Error('Empty SVG returned');
        }
        return svg;
    } catch (e) {
        console.error('Error rendering AFN Closure:', e);
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
            // Build HTML-like label with state header and items
            const itemRows = state.items
                .map((item: LRItem) => {
                    const before = item.alt.slice(0, item.dot).join('');
                    const after = item.alt.slice(item.dot).join('');
                    const la = hasLookahead && item.lookahead ? `,${item.lookahead}` : '';
                    let itemStr = `${item.prod.parent} -> ${before}.${after}${la}`;
                    itemStr = itemStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    return `<tr><td align="left"><font face="Fira Mono" point-size="9">${itemStr}</font></td></tr>`;
                })
                .join('');

            // Check if any item in this state is a reduce/accept item
            const hasAccept = state.items.some((item: LRItem) => item.dot >= item.alt.length);
            const borderColor = hasAccept ? '#28a745' : '#4a90d9';
            const headerBg = hasAccept ? '#d4edda' : '#d0e4f5';

            const htmlLabel = `<<table border="0" cellborder="0" cellspacing="0" cellpadding="4">
              <tr><td bgcolor="${headerBg}" align="center"><font face="Fira Mono" point-size="10"><b>I${state.id}</b></font></td></tr>
              <hr/>
              ${itemRows}
            </table>>`;

            nodes.push(`  S${state.id} [label=${htmlLabel}, shape=rect, style="rounded,filled", fillcolor="#ffffff", color="${borderColor}", penwidth=1.5, margin="0.2,0.1"];`);
        }

        for (const [key, target] of transitions) {
            const [from, sym] = key.split(',');
            const isEpsilon = sym === 'ε' || sym === '';
            const style = isEpsilon 
                ? 'style=dashed, color="#adb5bd", fontcolor="#adb5bd"' 
                : 'color="#495057", fontcolor="#495057"';
            edges.push(`  S${from} -> S${target} [label="${sym}", fontname="Fira Mono", fontsize=10, ${style}];`);
        }

        const displayTitle = title.replace(/_/g, ' ');
        const dot = `digraph ${title} {
  rankdir=LR;
  bgcolor=transparent;
  graph [bgcolor=transparent, pad="0.3", nodesep=0.5, ranksep=0.7];
  node [fontname="Fira Mono"];
  edge [fontname="Fira Mono", fontsize=10];
  labelloc="t";
  label="${displayTitle}";
  fontname="Fira Mono";
  fontsize=14;
  fontcolor="#495057";
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
            nodes.push(`  "S${stateId}" [label="S${stateId}", shape=circle, style=filled, fillcolor="#d0e4f5", color="#4a90d9", fontsize=11, fontname="Fira Mono"];`);
        }

        for (const [key, target] of transitions) {
            const [from, sym] = key.split(',');
            const isEpsilon = sym === 'ε' || sym === '';
            const edgeStyle = isEpsilon 
                ? 'style=dashed, color="#adb5bd", fontcolor="#adb5bd"' 
                : 'color="#495057", fontcolor="#495057"';
            edges.push(`  "S${from}" -> "S${target}" [label="${sym}", fontname="Fira Mono", fontsize=10, ${edgeStyle}];`);
        }

        const displayTitle = title.replace(/_/g, ' ');
        const dot = `digraph ${title} {
  rankdir=LR;
  bgcolor=transparent;
  graph [bgcolor=transparent, pad="0.3"];
  node [shape=circle, fontsize=11, fontname="Fira Mono"];
  edge [fontname="Fira Mono"];
  labelloc="t";
  label="${displayTitle}";
  fontname="Fira Mono";
  fontsize=14;
  fontcolor="#495057";
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
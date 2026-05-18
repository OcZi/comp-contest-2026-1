<script lang="ts">
    import * as gram from './grammar';
    import { compute_first, compute_follow } from '$lib/algorithms/algorithms';
    import { compute_ll1_safe } from '$lib/parser/ll1';
    import { compute_lr0, compute_lr0_table } from '$lib/parser/lr0';
    import { compute_lr1, compute_lr1_table } from '$lib/parser/lr1';
    import { compute_lalr } from '$lib/parser/lalr1';
    import { recursive_descent } from '$lib/parser/descent_rec';
    import { renderAstSvg, renderAFNItemsSvg, renderGotoSvg } from '$lib/utils/graph';
    import type { ASTNode } from '$lib/parser/parse_types';
    import GrammarKeyboard from './GrammarKeyboard.svelte';

    interface ProdItem {
        id: number;
        text: string;
    }

    let prodId = $state(0);
    let productions = $state<ProdItem[]>([{ id: 0, text: 'S -> A' }]);

    function prodToRaw(): string {
        return productions
            .map((p) => p.text.trim())
            .filter((t) => t.length > 0)
            .join(';\n');
    }

    let selectedParser = $state<string>('ll1');
    let selectedMode = $state<gram.GrammarMode>('compact');

    function onParserChange() {
        activeTab = 'raw';
        automatonSvg = '';
        llTableData = null;
        lrTableData = null;
        afnSvg = '';
        gotoSvg = '';
        astSvg = '';
    }

    interface LL1TableData {
    terminals: string[];
    rows: { nt: string; cells: (string | null)[] }[];
}

function getLL1TableData(table: Map<string, Map<string, string[]>>, nonTerminals: Set<string>, terminals: Set<string>): LL1TableData {
    const sortedTerminals = [...terminals, '$'].filter(s => s !== 'ε').sort();
    const sortedNonTerminals = [...nonTerminals].sort();
    
    const rows = sortedNonTerminals.map(nt => {
        const row = table.get(nt);
        const cells = sortedTerminals.map(t => {
            const prod = row?.get(t);
            if (prod && prod.length > 0 && prod[0] !== 'ε') return prod.join('');
            if (prod && prod[0] === 'ε') return 'ε';
            return null;
        });
        return { nt, cells };
    });
    
    return { terminals: sortedTerminals, rows };
}

interface LRTableData {
    headers: string[];
    rows: { state: number; cells: { value: string; type: string | null }[] }[];
}

function getLRTableData(action: Map<string, any>, goto: Map<string, number>, nonTerminals: Set<string>, terminals: Set<string>): LRTableData {
    const allTerminals = [...terminals].filter(t => t !== 'ε').sort();
    const allNonTerminals = [...nonTerminals].sort();
    const headers = [...allTerminals, '$', ...allNonTerminals];

    const stateActions = new Map<number, Map<string, { value: string; type: string | null }>>();
    
    for (const [key, act] of action) {
        const [state, sym] = key.split(',');
        const stateNum = parseInt(state);
        if (!stateActions.has(stateNum)) {
            stateActions.set(stateNum, new Map());
        }
        let value = '';
        let type: string | null = null;
        if (act.type === 'shift') { value = `s${act.state}`; type = 'shift'; }
        else if (act.type === 'reduce') { value = `r${act.prod.parent}${act.alt.join('')}`; type = 'reduce'; }
        else if (act.type === 'accept') { value = 'acc'; type = 'accept'; }
        stateActions.get(stateNum)!.set(sym, { value, type });
    }

    for (const [key, target] of goto) {
        const [state, sym] = key.split(',');
        const stateNum = parseInt(state);
        if (!stateActions.has(stateNum)) stateActions.set(stateNum, new Map());
        stateActions.get(stateNum)!.set(sym, { value: String(target), type: 'goto' });
    }

    const sortedStates = [...stateActions.keys()].sort((a, b) => a - b);
    
    const rows = sortedStates.map(state => {
        const stateRow = stateActions.get(state)!;
        const cells = headers.map(sym => stateRow.get(sym) || null);
        return { state, cells };
    });
    
    return { headers, rows };
}
    let inputString = $state('');
    let result = $state<any>(null);
    let astSvg = $state<string>('');
    let automatonSvg = $state<string>('');
    let llTableData = $state<LL1TableData | null>(null);
    let lrTableData = $state<LRTableData | null>(null);
    let afnSvg = $state<string>('');
    let gotoSvg = $state<string>('');
    let error = $state<string | null>(null);
    let activeTab = $state<'raw' | 'ast' | 'table' | 'items' | 'goto'>('raw');

    let editingIndex = $state<number | null>(null);
    let editValue = $state('');

    function startEdit(index: number) {
        editingIndex = index;
        editValue = productions[index].text;
    }

    function saveEdit() {
        if (editingIndex === null) return;
        if (editValue.trim() === '') {
            productions = productions.filter((_, i) => i !== editingIndex);
        } else {
            productions[editingIndex].text = editValue;
        }
        editingIndex = null;
        editValue = '';
    }

    function cancelEdit() {
        editingIndex = null;
        editValue = '';
    }

    function addProduction() {
        prodId++;
        productions = [...productions, { id: prodId, text: 'S -> ' }];
        setTimeout(() => {
            const inputs = document.querySelectorAll('.prod-chip input');
            const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
            lastInput?.focus();
        }, 0);
    }

    function removeProduction(index: number) {
        productions = productions.filter((_, i) => i !== index);
    }

    function createNextProduction() {
        const currentText = editValue.trim();
        if (currentText !== '' && editingIndex !== null) {
            productions[editingIndex].text = currentText;
        }
        prodId++;
        productions = [...productions, { id: prodId, text: '' }];
        editingIndex = productions.length - 1;
        editValue = '';
        setTimeout(() => {
            const inputs = document.querySelectorAll('.prod-chip input');
            const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
            lastInput?.focus();
        }, 0);
    }

    async function runParser() {
        error = null;
        const raw = prodToRaw();
        if (!raw.trim()) {
            error = 'Ingresa una gramática';
            return;
        }

        try {
            const g = gram.parse_bnf(prodToRaw(), selectedMode);
            const first = compute_first(g);
            const follow = compute_follow(g, first);

            switch (selectedParser) {
                case 'll1': {
                    const { table, conflicts } = compute_ll1_safe(g, first, follow);
                    result = {
                        table: Object.fromEntries([...table].map(([k, v]) => [k, Object.fromEntries(v)])),
                        conflicts
                    };
                    llTableData = getLL1TableData(table, g.non_terminals, g.terminals);
                    automatonSvg = '';
                    afnSvg = '';
                    break;
                }
                case 'lr0': {
                    const automaton = compute_lr0(g);
                    const { action, goto, conflicts } = compute_lr0_table(g, automaton);
                    result = {
                        states: automaton.states,
                        action: Object.fromEntries(action),
                        goto: Object.fromEntries(goto),
                        conflicts
                    };
                    lrTableData = getLRTableData(action, goto, g.non_terminals, g.terminals);
                    automatonSvg = await renderAFNItemsSvg(automaton.states, automaton.transitions, 'LR0_Items');
                    afnSvg = '';
                    gotoSvg = await renderGotoSvg(automaton.transitions, 'LR0_GOTO');
                    break;
                }
                case 'lr1': {
                    const { states, transitions } = compute_lr1(g, first);
                    const { action, goto, conflicts } = compute_lr1_table(g, states, transitions);
                    result = {
                        states,
                        action: Object.fromEntries(action),
                        goto: Object.fromEntries(goto),
                        conflicts
                    };
                    lrTableData = getLRTableData(action, goto, g.non_terminals, g.terminals);
                    automatonSvg = await renderAFNItemsSvg(states, transitions, 'LR1_Items');
                    afnSvg = '';
                    gotoSvg = await renderGotoSvg(transitions, 'LR1_GOTO');
                    break;
                }
                case 'lalr1': {
                    const r = compute_lalr(g, first);
                    result = {
                        states: r.states,
                        transitions: Object.fromEntries(r.transitions),
                        action: Object.fromEntries(r.action),
                        goto: Object.fromEntries(r.goto),
                        conflicts: r.conflicts
                    };
                    const lalrStates = r.states || [];
                    const lalrTransitions = r.transitions || new Map();
                    lrTableData = getLRTableData(r.action, r.goto, g.non_terminals, g.terminals);
                    automatonSvg = await renderAFNItemsSvg(lalrStates, lalrTransitions, 'LALR1_Items');
                    afnSvg = '';
                    gotoSvg = await renderGotoSvg(lalrTransitions, 'LALR1_GOTO');
                    break;
                }
                case 'descent': {
                    const { table } = compute_ll1_safe(g, first, follow);
                    const tableMap = new Map([...table].map(([k, v]) => [k, new Map(v)]));
                    const ast = recursive_descent(g, tableMap, inputString);
                    result = ast;
                    console.log('AST parsed:', JSON.stringify(ast));
                    if (ast) {
                        astSvg = await renderAstSvg(ast);
                        console.log('astSvg set:', astSvg.substring(0, 100));
                    }
                    break;
                }
            }
        } catch (e: any) {
            error = e.message || 'Error al procesar';
        }
    }
</script>

<div class="grammar-input">
    <div class="productions-section">
        <div class="section-title">Productions</div>
        
        <GrammarKeyboard onSymbolClick={(sym: string) => {
            if (editingIndex !== null) {
                editValue += sym;
            } else {
                const lastIdx = productions.length - 1;
                if (lastIdx >= 0 && productions[lastIdx].text.trim() !== '') {
                    productions[lastIdx].text += sym;
                }
            }
        }} />

        <div class="productions-flex">
            {#each productions as prod, index (prod.id)}
                <div class="prod-chip">
                    {#if editingIndex === index}
                        <input
                            class="chip-input"
                            bind:value={editValue}
                            onkeydown={(e) => {
                                if (e.key === 'Escape') {
                                    cancelEdit();
                                } else if (e.key === ';' || e.key === 'Enter') {
                                    e.preventDefault();
                                    createNextProduction();
                                }
                            }}
                            onblur={saveEdit}
                        />
                    {:else}
                        <span class="chip-content" onclick={() => startEdit(index)}>{prod.text}</span>
                        <button class="remove-btn" onclick={() => removeProduction(index)}>×</button>
                    {/if}
                </div>
            {/each}
            <button class="add-chip" onclick={addProduction}>+</button>
        </div>
    </div>

    <div class="controls-section">
        <div class="controls">
            <select bind:value={selectedParser} onchange={onParserChange}>
                <option value="ll1">LL(1)</option>
                <option value="lr0">LR(0)</option>
                <option value="lr1">LR(1)</option>
                <option value="lalr1">LALR(1)</option>
                <option value="descent">Recursive Descent</option>
            </select>
            <select bind:value={selectedMode} onchange={onParserChange}>
                <option value="compact">Compact</option>
                <option value="spaced">Spaced</option>
            </select>
            <button onclick={runParser}>Parse</button>
        </div>

        <div class="input-string">
            <label>Input:</label>
            <input bind:value={inputString} placeholder="String to parse" />
        </div>
</div>

    {#if error}
        <p class="error">{error}</p>
    {/if}

    {#if result}
        <div class="tabs">
            <button class="tab" class:active={activeTab === 'raw'} onclick={() => activeTab = 'raw'}>Raw Output</button>
            {#if selectedParser === 'descent' && astSvg}
                <button class="tab" class:active={activeTab === 'ast'} onclick={() => activeTab = 'ast'}>AST</button>
            {/if}
            {#if selectedParser === 'll1' && llTableData}
                <button class="tab" class:active={activeTab === 'table'} onclick={() => activeTab = 'table'}>Parsing Table</button>
            {/if}
            {#if (selectedParser === 'lr0' || selectedParser === 'lr1' || selectedParser === 'lalr1') && lrTableData}
                <button class="tab" class:active={activeTab === 'table'} onclick={() => activeTab = 'table'}>Parsing Table</button>
            {/if}
            {#if selectedParser !== 'descent' && automatonSvg}
                <button class="tab" class:active={activeTab === 'items'} onclick={() => activeTab = 'items'}>LR Items</button>
            {/if}
            {#if selectedParser !== 'descent' && gotoSvg}
                <button class="tab" class:active={activeTab === 'goto'} onclick={() => activeTab = 'goto'}>GOTO</button>
            {/if}
        </div>
        <div class="tab-content">
            {#if activeTab === 'raw'}
                <pre>{JSON.stringify(result, null, 2)}</pre>
            {:else if activeTab === 'ast' && astSvg}
                <div class="ast-svg">{@html astSvg}</div>
            {:else if activeTab === 'table'}
                {#if llTableData}
                    <table class="ll-table">
                        <thead>
                            <tr>
                                <th>NT</th>
                                {#each llTableData.terminals as t(t)}
                                    <th>{t}</th>
                                {/each}
                            </tr>
                        </thead>
                        <tbody>
                            {#each llTableData.rows as row(row)}
                                <tr>
                                    <td class="nt-cell">{row.nt}</td>
                                    {#each row.cells as cell(cell)}
                                        <td>{cell || '-'}</td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                {:else if lrTableData}
                    <table class="lr-table">
                        <thead>
                            <tr>
                                <th>State</th>
                                {#each lrTableData.headers as h(h)}
                                    <th>{h}</th>
                                {/each}
                            </tr>
                        </thead>
                        <tbody>
                            {#each lrTableData.rows as row(row)}
                                <tr>
                                    <td class="state-cell">{row.state}</td>
                                    {#each row.cells as cell(cell)}
                                        <td class:shift={cell?.type === 'shift'} class:reduce={cell?.type === 'reduce'} class:goto={cell?.type === 'goto'} class:accept={cell?.type === 'accept'}>
                                            {cell?.value || '-'}
                                        </td>
                                    {/each}
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                {/if}
            {:else if activeTab === 'items' && automatonSvg}
                <div class="automaton-svg">{@html automatonSvg}</div>
            {:else if activeTab === 'goto' && gotoSvg}
                <div class="automaton-svg">{@html gotoSvg}</div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .grammar-input {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .section-title {
        font-size: 1.1rem;
        font-weight: 600;
        color: #333;
        margin-bottom: 0.5rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .section-title::before {
        content: '';
        width: 4px;
        height: 1.2rem;
        background: #4a90d9;
        border-radius: 2px;
    }

    .productions-section {
        background: #fff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 1rem;
    }

    .productions-flex {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }

    .prod-chip {
        display: inline-flex;
        align-items: center;
        padding: 0.4rem 0.6rem;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        border: 1px solid #dee2e6;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .prod-chip:hover {
        background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%);
        border-color: #4a90d9;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .chip-content {
        font-family: 'Fira Mono', monospace;
        font-size: 0.875rem;
        white-space: nowrap;
        color: #495057;
    }

    .chip-input {
        padding: 0.3rem 0.5rem;
        font-family: 'Fira Mono', monospace;
        font-size: 0.875rem;
        border: 2px solid #4a90d9;
        border-radius: 4px;
        outline: none;
        background: #fff;
    }

    .add-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1.25rem;
        font-weight: bold;
        transition: all 0.2s ease;
    }

    .add-chip:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 8px rgba(74, 144, 217, 0.3);
    }

    .add-chip:active {
        transform: scale(0.95);
    }

    .remove-btn {
        margin-left: 0.4rem;
        padding: 0 0.3rem;
        background: none;
        border: none;
        color: #adb5bd;
        cursor: pointer;
        font-size: 1rem;
        line-height: 1;
        transition: color 0.2s;
    }

    .remove-btn:hover {
        color: #dc3545;
    }

    .controls-section {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
    }

    .controls {
        display: flex;
        gap: 0.5rem;
    }

    .controls select {
        padding: 0.5rem 0.75rem;
        border: 1px solid #ced4da;
        border-radius: 6px;
        background: #fff;
        font-size: 0.9rem;
        color: #495057;
        cursor: pointer;
        min-width: 120px;
    }

    .controls select:focus {
        outline: none;
        border-color: #4a90d9;
        box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
    }

    .controls button {
        padding: 0.5rem 1.25rem;
        background: linear-gradient(135deg, #28a745 0%, #218838 100%);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .controls button:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(40, 167, 69, 0.25);
    }

    .controls button:active {
        transform: translateY(0);
    }

    .input-string {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .input-string label {
        font-size: 0.9rem;
        color: #6c757d;
        white-space: nowrap;
    }

    .input-string input {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border: 1px solid #ced4da;
        border-radius: 6px;
        font-family: 'Fira Mono', monospace;
        font-size: 0.875rem;
    }

    .input-string input:focus {
        outline: none;
        border-color: #4a90d9;
        box-shadow: 0 0 0 3px rgba(74, 144, 217, 0.1);
    }

    .error {
        background: #fff3f3;
        border: 1px solid #ffc9c9;
        color: #dc3545;
        padding: 0.75rem 1rem;
        border-radius: 6px;
        font-size: 0.9rem;
    }

    .tabs {
        display: flex;
        border-bottom: 2px solid #e9ecef;
        margin-top: 1rem;
        gap: 0.25rem;
    }

    .tab {
        padding: 0.75rem 1.25rem;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        color: #6c757d;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        transition: all 0.2s ease;
    }

    .tab:hover {
        color: #495057;
        background: #f8f9fa;
    }

    .tab.active {
        color: #4a90d9;
        border-bottom-color: #4a90d9;
    }

    .tab-content {
        padding: 1rem 0;
    }

    pre {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        padding: 1rem;
        border-radius: 8px;
        overflow-x: auto;
        max-height: 500px;
        font-family: 'Fira Mono', monospace;
        font-size: 0.8rem;
        line-height: 1.5;
    }

    .ast-svg, .automaton-svg {
        overflow-x: auto;
        max-height: 600px;
        background: #fff;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        padding: 1rem;
    }

    .ast-svg :global(svg), .automaton-svg :global(svg) {
        max-width: 100%;
        height: auto;
    }

    .html-table {
        overflow-x: auto;
        background: #fff;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        padding: 0.5rem;
    }

    .html-table table.parsing-table {
        border-collapse: collapse;
        font-size: 0.85rem;
        width: 100%;
    }

    .html-table table.parsing-table th,
    .html-table table.parsing-table td {
        border: 1px solid #dee2e6;
        padding: 0.5rem 0.75rem;
        text-align: center;
    }

    .html-table table.parsing-table th {
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        font-weight: 600;
        color: #495057;
    }

    .html-table table.parsing-table td {
        font-family: 'Fira Mono', monospace;
        color: #212529;
    }

    .html-table table.parsing-table tr:hover {
        background: #f8f9fa;
    }

    .html-table table.parsing-table td:first-child {
        font-weight: 600;
        background: #f8f9fa;
    }

    .ll-table, .lr-table {
        width: 100%;
        border-collapse: collapse;
        font-family: 'Fira Mono', monospace;
        font-size: 0.875rem;
        background: #fff;
        border-radius: 8px;
        overflow: hidden;
    }

    .ll-table th, .ll-table td,
    .lr-table th, .lr-table td {
        padding: 0.5rem 0.75rem;
        border: 1px solid #dee2e6;
        text-align: center;
    }

    .ll-table th, .lr-table th {
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        font-weight: 600;
        color: #495057;
    }

    .nt-cell, .state-cell {
        background: #fafafa;
        font-weight: 600;
    }

    .ll-table tr:hover, .lr-table tr:hover {
        background: #f8f9fa;
    }

    .lr-table .shift {
        color: #27ae60;
        font-weight: 500;
    }

    .lr-table .reduce {
        color: #e67e22;
        font-weight: 500;
    }

    .lr-table .goto {
        color: #3498db;
        font-weight: 500;
    }

    .lr-table .accept {
        color: #9b59b6;
        font-weight: 600;
    }
</style>
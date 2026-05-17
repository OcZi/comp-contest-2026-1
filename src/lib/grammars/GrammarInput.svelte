<script lang="ts">
    import * as gram from './grammar';
    import { compute_first, compute_follow } from '$lib/algorithms/algorithms';
    import { compute_ll1_safe } from '$lib/parser/ll1';
    import { compute_lr0, compute_lr0_table } from '$lib/parser/lr0';
    import { compute_lr1, compute_lr1_table } from '$lib/parser/lr1';
    import { compute_lalr } from '$lib/parser/lalr1';
    import { recursive_descent } from '$lib/parser/descent_rec';
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
    let inputString = $state('');
    let result = $state<any>(null);
    let error = $state<string | null>(null);

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

    function runParser() {
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
                    break;
                }
                case 'lalr1': {
                    const r = compute_lalr(g, first);
                    result = {
                        action: Object.fromEntries(r.action),
                        goto: Object.fromEntries(r.goto),
                        conflicts: r.conflicts
                    };
                    break;
                }
                case 'descent': {
                    const { table } = compute_ll1_safe(g, first, follow);
                    const tableMap = new Map([...table].map(([k, v]) => [k, new Map(v)]));
                    result = recursive_descent(g, tableMap, inputString);
                    break;
                }
            }
        } catch (e: any) {
            error = e.message || 'Error al procesar';
        }
    }
</script>

<div class="grammar-input">
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

    


    <input bind:value={inputString} placeholder="Input a parsear" />

    <div class="controls">
        <select bind:value={selectedParser}>
            <option value="ll1">LL(1)</option>
            <option value="lr0">LR(0)</option>
            <option value="lr1">LR(1)</option>
            <option value="lalr1">LALR(1)</option>
            <option value="descent">Recursive Descent</option>
        </select>
        <select bind:value={selectedMode}>
            <option value="compact">Compact</option>
            <option value="spaced">Spaced</option>
        </select>
        <button onclick={runParser}>Parse</button>
    </div>

    {#if error}
        <p class="error">{error}</p>
    {/if}

    {#if result}
        <pre>{JSON.stringify(result, null, 2)}</pre>
    {/if}
</div>

<style>
    .grammar-input {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .productions-flex {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .prod-chip {
        display: inline-flex;
        align-items: center;
        padding: 0.5rem 0.75rem;
        background: #f0f0f0;
        border: 1px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.2s;
    }

    .prod-chip:hover {
        background: #e0e0e0;
    }

    .chip-content {
        font-family: monospace;
        white-space: nowrap;
    }

    .chip-input {
        padding: 0.25rem;
        font-family: monospace;
        border: 1px solid #999;
        border-radius: 2px;
    }

    .add-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.5rem 0.75rem;
        background: #4a90d9;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 1.2rem;
    }

    .add-chip:hover {
        background: #3a7bc8;
    }

    .remove-btn {
        margin-left: 0.5rem;
        padding: 0 0.4rem;
        background: none;
        border: none;
        color: #999;
        cursor: pointer;
        font-size: 1rem;
    }

    .remove-btn:hover {
        color: red;
    }

    .controls {
        display: flex;
        gap: 0.5rem;
    }

    .controls select,
    .controls button {
        padding: 0.5rem;
    }

    .error {
        color: red;
    }

    pre {
        background: #f5f5f5;
        padding: 1rem;
        overflow-x: auto;
        max-height: 400px;
    }
</style>
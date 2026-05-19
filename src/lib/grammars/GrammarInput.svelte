<script lang="ts">
	import { onMount } from 'svelte';
	import * as gram from './grammar';
	import { compute_first, compute_follow } from '$lib/algorithms/algorithms';
	import { compute_ll1_safe } from '$lib/parser/ll1';
	import { compute_lr0, compute_lr0_table } from '$lib/parser/lr0';
	import { compute_lr1, compute_lr1_table } from '$lib/parser/lr1';
	import { compute_lalr } from '$lib/parser/lalr1';
	import { recursive_descent } from '$lib/parser/descent_rec';
	import {
		renderAstSvg,
		renderAFNItemsSvg,
		renderGotoSvg,
		renderClosureAfnSvg
	} from '$lib/utils/graph';
	import { browser } from '$app/environment';
	import type { ASTNode } from '$lib/parser/parse_types';
	import GrammarKeyboard from './GrammarKeyboard.svelte';

	interface ProdItem {
		id: number;
		text: string;
	}

	let prodId = 0;
	let productions = $state<ProdItem[]>([{ id: 0, text: 'S -> A' }]);

	let isRawMode = $state(false);
	let rawGrammarInput = $state('S -> A');
	let sessionId = $state<string | null>(null);
	let grammarHistory = $state<string[]>([]);

	$effect(() => {
		if (browser) {
			const saved = localStorage.getItem('grammarHistory');
			if (saved) {
				try {
					grammarHistory = JSON.parse(saved);
				} catch (e) {
					// ignore
				}
			}
		}
	});

	function encodeGrammar(raw: string): string {
		try {
			// Compact representation for sharing
			return btoa(encodeURIComponent(raw));
		} catch (e) {
			return '';
		}
	}

	function decodeGrammar(encoded: string): string {
		try {
			return decodeURIComponent(atob(encoded));
		} catch (e) {
			return '';
		}
	}

	onMount(() => {
		if (browser) {
			const urlParams = new URLSearchParams(window.location.search);
			const g = urlParams.get('g');
			if (g) {
				const decoded = decodeGrammar(g);
				if (decoded) {
					rawGrammarInput = decoded;
					isRawMode = true;
					const parts = decoded
						.split(';')
						.map((p) => p.trim())
						.filter(Boolean);
					productions = parts.map((text) => {
						const id = prodId++;
						return { id, text };
					});
					if (productions.length === 0) {
						const id = prodId++;
						productions = [{ id, text: 'S -> ' }];
					}
					// Parse loaded grammar automatically
					runParser();
				}
			}
		}
	});

	function toggleRawMode() {
		if (isRawMode) {
			const parts = rawGrammarInput
				.split(';')
				.map((p) => p.trim())
				.filter(Boolean);
			productions = parts.map((text) => {
				const id = prodId++;
				return { id, text };
			});
			if (productions.length === 0) {
				const id = prodId++;
				productions = [{ id, text: 'S -> ' }];
			}
			isRawMode = false;
		} else {
			rawGrammarInput = productions
				.map((p) => p.text.trim())
				.filter((t) => t.length > 0)
				.join(';\n');
			isRawMode = true;
		}
	}

	function prodToRaw(): string {
		if (isRawMode) return rawGrammarInput;
		return productions
			.map((p) => p.text.trim())
			.filter((t) => t.length > 0)
			.join(';\n');
	}

	let selectedParser = $state<string>('ll1');
	let selectedMode = $state<gram.GrammarMode>('compact');

	function onParserChange() {
		const raw = prodToRaw();
		if (!raw.trim()) {
			automatonSvg = '';
			llTableData = null;
			lrTableData = null;
			parseSteps = [];
			afnSvg = '';
			gotoSvg = '';
			astSvg = '';
			firstData = null;
			followData = null;
			result = null;
			error = null;
			parsedGrammar = null;
			conflicts = [];
			return;
		}
		runParser();
	}

	interface LL1TableData {
		terminals: string[];
		rows: { nt: string; cells: (string | null)[] }[];
	}

	function getLL1TableData(
		table: Map<string, Map<string, string[]>>,
		nonTerminals: Set<string>,
		terminals: Set<string>
	): LL1TableData {
		const sortedTerminals = [...terminals, '$'].filter((s) => s !== 'ε').sort();
		const sortedNonTerminals = [...nonTerminals].sort();

		const rows = sortedNonTerminals.map((nt) => {
			const row = table.get(nt);
			const cells = sortedTerminals.map((t) => {
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
		rows: { state: number; cells: ({ value: string; type: string | null } | null)[] }[];
	}

	function getLRTableData(
		action: Map<string, any>,
		goto: Map<string, number>,
		nonTerminals: Set<string>,
		terminals: Set<string>
	): LRTableData {
		const allTerminals = [...terminals].filter((t) => t !== 'ε').sort();
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
			if (act.type === 'shift') {
				value = `s${act.state}`;
				type = 'shift';
			} else if (act.type === 'reduce') {
				value = `r${act.prod.parent}${act.alt.join('')}`;
				type = 'reduce';
			} else if (act.type === 'accept') {
				value = 'acc';
				type = 'accept';
			}
			stateActions.get(stateNum)!.set(sym, { value, type });
		}

		for (const [key, target] of goto) {
			const [state, sym] = key.split(',');
			const stateNum = parseInt(state);
			if (!stateActions.has(stateNum)) stateActions.set(stateNum, new Map());
			stateActions.get(stateNum)!.set(sym, { value: String(target), type: 'goto' });
		}

		const sortedStates = [...stateActions.keys()].sort((a, b) => a - b);

		const rows = sortedStates.map((state) => {
			const stateRow = stateActions.get(state)!;
			const cells = headers.map((sym) => stateRow.get(sym) || null);
			return { state, cells };
		});

		return { headers, rows };
	}

	interface ParseStep {
		step: number;
		stack: string;
		input: string;
		action: string;
	}

	function getDescentSteps(
		g: gram.Grammar,
		table: Map<string, Map<string, string[]>>,
		input: string
	): ParseStep[] {
		const steps: ParseStep[] = [];
		const tokens =
			g.mode === 'compact'
				? input.split('').filter((c) => c !== ' ')
				: input.split(' ').filter(Boolean);
		tokens.push('$');

		let stack: string[] = [g.productions[0].parent];
		let pos = 0;
		let step = 0;

		const parse = (symbol: string): boolean => {
			if (symbol === '$') {
				if (tokens[pos] === '$' && stack.length === 1) {
					steps.push({
						step: ++step,
						stack: stack.join(' '),
						input: tokens.slice(pos).join(''),
						action: 'Accept'
					});
					return true;
				}
				return false;
			}

			const token = tokens[pos];

			if (g.terminals.has(symbol)) {
				if (symbol === token) {
					steps.push({
						step: ++step,
						stack: stack.join(' '),
						input: tokens.slice(pos).join(''),
						action: `Match '${symbol}'`
					});
					stack.pop();
					pos++;
					return true;
				}
				steps.push({
					step: ++step,
					stack: stack.join(' '),
					input: tokens.slice(pos).join(''),
					action: `Error: expected '${symbol}', got '${token}'`
				});
				return false;
			}

			const row = table.get(symbol);
			const production = row?.get(token);

			if (!production) {
				steps.push({
					step: ++step,
					stack: stack.join(' '),
					input: tokens.slice(pos).join(''),
					action: `Error: no rule for ${symbol} with ${token}`
				});
				return false;
			}

			steps.push({
				step: ++step,
				stack: stack.join(' '),
				input: tokens.slice(pos).join(''),
				action: `${symbol} → ${production.join('')}`
			});

			stack.pop();

			if (production[0] !== 'ε') {
				const prodStack = [...production].reverse();
				for (const s of prodStack) {
					stack.push(s);
				}
			}

			while (stack.length > 0) {
				const top = stack[stack.length - 1];
				if (!parse(top)) {
					return false;
				}
			}

			return pos >= tokens.length - 1;
		};

		parse(g.productions[0].parent);
		return steps;
	}

	function getLL1Steps(table: Map<string, Map<string, string[]>>, input: string): ParseStep[] {
		const steps: ParseStep[] = [];
		const tokens = input.split('').filter((c) => c !== ' ');
		tokens.push('$');

		let stack: string[] = [];
		let pos = 0;
		let step = 1;

		const firstSymbol = tokens[0] === '$' ? '$' : tokens[0];
		const firstProd = table.get('S')?.get(firstSymbol);
		if (firstProd) {
			stack = [...firstProd].reverse();
			steps.push({
				step: step++,
				stack: stack.join(' '),
				input: tokens.slice(pos).join(''),
				action: `S → ${firstProd.join('')}`
			});
		} else {
			steps.push({
				step: step++,
				stack: 'S',
				input: tokens.join(''),
				action: 'Error: no rule for S'
			});
			return steps;
		}

		while (stack.length > 0 && pos < tokens.length) {
			const top = stack[stack.length - 1];
			const currentToken = tokens[pos] || '$';

			if (/^[A-Z]$/.test(top)) {
				const prod = table.get(top)?.get(currentToken);
				if (prod) {
					stack.pop();
					if (prod[0] !== 'ε') {
						stack.push(...[...prod].reverse());
					}
					steps.push({
						step: step++,
						stack: stack.join(' '),
						input: tokens.slice(pos).join(''),
						action: `${top} → ${prod.join('')}`
					});
				} else {
					steps.push({
						step: step++,
						stack: stack.join(' '),
						input: tokens.slice(pos).join(''),
						action: `Error: no rule for ${top}`
					});
					break;
				}
			} else {
				if (top === currentToken) {
					steps.push({
						step: step++,
						stack: stack.join(' '),
						input: tokens.slice(pos + 1).join(''),
						action: `Match '${top}'`
					});
					stack.pop();
					pos++;
				} else {
					steps.push({
						step: step++,
						stack: stack.join(' '),
						input: tokens.slice(pos).join(''),
						action: `Error: expected '${top}', got '${currentToken}'`
					});
					break;
				}
			}

			if (stack.length === 0 && pos >= tokens.length - 1) {
				steps.push({ step: step++, stack: '', input: '', action: 'Accept' });
				break;
			}
		}

		return steps;
	}

	function getLRSteps(
		action: Map<string, any>,
		goto: Map<string, number>,
		input: string
	): ParseStep[] {
		const steps: ParseStep[] = [];
		const tokens = input.split('').filter((c) => c !== ' ');
		tokens.push('$');

		if (tokens.length === 1) {
			steps.push({ step: 1, stack: '0', input: '$', action: 'Start' });
			return steps;
		}

		let stack: (string | number)[] = [0];
		let pos = 0;
		let step = 1;

		steps.push({
			step: step++,
			stack: stack.join(' '),
			input: tokens.slice(pos).join(''),
			action: 'Start'
		});

		while (pos < tokens.length) {
			const state = stack[stack.length - 1] as number;
			const token = tokens[pos];
			const key = `${state},${token}`;
			const act = action.get(key);

			if (!act) {
				steps.push({
					step: step++,
					stack: stack.join(' '),
					input: tokens.slice(pos).join(''),
					action: `Error: no action for ${token}`
				});
				break;
			}

			if (step > 1000) {
				steps.push({
					step: step++,
					stack: stack.join(' '),
					input: tokens.slice(pos).join(''),
					action: 'Error: Infinite loop detected'
				});
				break;
			}

			if (act.type === 'shift') {
				steps.push({
					step: step++,
					stack: stack.join(' '),
					input: tokens.slice(pos).join(''),
					action: `Shift to ${act.state}`
				});
				stack.push(token, act.state);
				pos++;
			} else if (act.type === 'reduce') {
				const prod = act.prod;
				const symbols = act.alt;
				steps.push({
					step: step++,
					stack: stack.join(' '),
					input: tokens.slice(pos).join(''),
					action: `Reduce: ${prod.parent} → ${symbols.join('')}`
				});

				const isEpsilon = symbols.length === 1 && symbols[0] === 'ε';
				const numToPop = isEpsilon ? 0 : symbols.length * 2;
				for (let i = 0; i < numToPop; i++) {
					stack.pop();
				}

				const gotoState = stack[stack.length - 1] as number;
				const gotoKey = `${gotoState},${prod.parent}`;
				const gotoTarget = goto.get(gotoKey);

				if (gotoTarget !== undefined) {
					stack.push(prod.parent, gotoTarget);
				} else {
					steps.push({
						step: step++,
						stack: stack.join(' '),
						input: tokens.slice(pos).join(''),
						action: `Error: No goto target for ${prod.parent} from state ${gotoState}`
					});
					break;
				}
			} else if (act.type === 'accept') {
				steps.push({ step: step++, stack: stack.join(' '), input: '', action: 'Accept' });
				break;
			}
		}

		return steps;
	}

	let inputString = $state('');
	let result = $state<any>(null);
	let astSvg = $state<string>('');
	let automatonSvg = $state<string>('');
	let llTableData = $state<LL1TableData | null>(null);
	let lrTableData = $state<LRTableData | null>(null);
	let parseSteps = $state<ParseStep[]>([]);
	let afnSvg = $state<string>('');
	let gotoSvg = $state<string>('');
	let error = $state<string | null>(null);
	let activeTab = $state<
		'table' | 'items' | 'steps' | 'summary' | 'goto' | 'raw' | 'ast' | 'first_follow'
	>('summary');
	let firstData = $state<Map<string, Set<string>> | null>(null);
	let followData = $state<Map<string, Set<string>> | null>(null);
	let parsedGrammar = $state<gram.Grammar | null>(null);
	let conflicts = $state<string[]>([]);

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
		const raw = isRawMode ? rawGrammarInput : prodToRaw();
		if (!raw.trim()) {
			error = 'Gramática vacía';
			return;
		}

		sessionId = encodeGrammar(raw);
		if (browser) {
			const newUrl = new URL(window.location.href);
			newUrl.searchParams.set('g', sessionId);
			window.history.replaceState({}, '', newUrl.toString());
		}

		if (!grammarHistory.includes(raw)) {
			grammarHistory = [raw, ...grammarHistory].slice(0, 50);
		} else {
			grammarHistory = [raw, ...grammarHistory.filter((g) => g !== raw)];
		}
		if (browser) {
			localStorage.setItem('grammarHistory', JSON.stringify(grammarHistory));
		}

		try {
			const g = gram.parse_bnf(raw, selectedMode);
			const first = compute_first(g);
			const follow = compute_follow(g, first);
			firstData = first;
			followData = follow;
			parsedGrammar = g;

			switch (selectedParser) {
				case 'll1': {
					const { table, conflicts: ll1conflicts } = compute_ll1_safe(g, first, follow);
					result = {
						table: Object.fromEntries([...table].map(([k, v]) => [k, Object.fromEntries(v)])),
						conflicts
					};
					conflicts = ll1conflicts.map(
						(c) =>
							`LL(1) conflict: ${c.nonTerminal} on '${c.terminal}' — existing: ${c.existing.join('')}, incoming: ${c.incoming.join('')}`
					);
					llTableData = getLL1TableData(table, g.non_terminals, g.terminals);
					parseSteps = getLL1Steps(table, inputString);
					automatonSvg = '';
					afnSvg = '';
					break;
				}
				case 'lr0': {
					const automaton = compute_lr0(g);
					const { action, goto, conflicts: lr0conflicts } = compute_lr0_table(g, automaton);
					result = {
						states: automaton.states,
						action: Object.fromEntries(action),
						goto: Object.fromEntries(goto),
						conflicts: lr0conflicts
					};
					conflicts = lr0conflicts;
					lrTableData = getLRTableData(action, goto, g.non_terminals, g.terminals);
					parseSteps = getLRSteps(action, goto, inputString);
					automatonSvg = await renderAFNItemsSvg(
						automaton.states,
						automaton.transitions,
						'LR0_Items'
					);
					afnSvg = '';
					gotoSvg = await renderClosureAfnSvg(g, 'LR0_AFN');
					break;
				}
				case 'lr1': {
					const { states, transitions } = compute_lr1(g, first);
					const {
						action,
						goto,
						conflicts: lr1conflicts
					} = compute_lr1_table(g, states, transitions);
					result = {
						states,
						action: Object.fromEntries(action),
						goto: Object.fromEntries(goto),
						conflicts: lr1conflicts
					};
					conflicts = lr1conflicts;
					lrTableData = getLRTableData(action, goto, g.non_terminals, g.terminals);
					parseSteps = getLRSteps(action, goto, inputString);
					automatonSvg = await renderAFNItemsSvg(states, transitions, 'LR1_Items');
					afnSvg = '';
					gotoSvg = await renderClosureAfnSvg(g, 'LR1_AFN', first);
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
					conflicts = r.conflicts;
					const lalrStates = r.states || [];
					const lalrTransitions = r.transitions || new Map();
					lrTableData = getLRTableData(r.action, r.goto, g.non_terminals, g.terminals);
					parseSteps = getLRSteps(r.action, r.goto, inputString);
					automatonSvg = await renderAFNItemsSvg(lalrStates, lalrTransitions, 'LALR1_Items');
					afnSvg = '';
					gotoSvg = await renderClosureAfnSvg(g, 'LALR1_AFN', first);
					break;
				}
				case 'descent': {
					const { table } = compute_ll1_safe(g, first, follow);
					const tableMap = new Map([...table].map(([k, v]) => [k, new Map(v)]));
					const ast = recursive_descent(g, tableMap, inputString);
					result = ast;
					parseSteps = getDescentSteps(g, tableMap, inputString);
					if (ast) {
						astSvg = await renderAstSvg(ast);
					}
					break;
				}
			}
		} catch (e: any) {
			error = e.message || 'Error al procesar';
		}
	}

	async function downloadTab(format: 'png' | 'pdf') {
		const element = document.getElementById('active-tab-content');
		if (!element) return;

		try {
			const html2canvasModule = await import('html2canvas');
			const html2canvas = html2canvasModule.default;
			const canvas = await html2canvas(element, {
				scale: 2,
				useCORS: true,
				backgroundColor: '#ffffff'
			});

			const imgData = canvas.toDataURL('image/png');
			const fileName = `grammar-parser-${activeTab}-${Date.now()}`;

			if (format === 'png') {
				const link = document.createElement('a');
				link.download = `${fileName}.png`;
				link.href = imgData;
				link.click();
			} else if (format === 'pdf') {
				const jspdfModule = await import('jspdf');
				const jsPDF = jspdfModule.jsPDF;
				const pdf = new jsPDF({
					orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
					unit: 'px',
					format: [canvas.width, canvas.height]
				});
				pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
				pdf.save(`${fileName}.pdf`);
			}
		} catch (e) {
			console.error('Error exporting tab:', e);
			alert('Failed to export tab: ' + e);
		}
	}
</script>

<div class="grammar-input">
	<div class="productions-section">
		<div class="section-title">Grammar editor</div>

		<div class="keyboard-row">
			<GrammarKeyboard
				onSymbolClick={(sym: string) => {
					if (isRawMode) {
						rawGrammarInput += sym;
						return;
					}
					if (editingIndex !== null) {
						editValue += sym;
						setTimeout(() => {
							const inputs = document.querySelectorAll('.prod-chip input.chip-input');
							if (editingIndex !== null && inputs[editingIndex]) {
								(inputs[editingIndex] as HTMLInputElement).focus();
							}
						}, 0);
					} else {
						const lastIdx = productions.length - 1;
						if (lastIdx >= 0) {
							editingIndex = lastIdx;
							editValue = productions[lastIdx].text + sym;
							setTimeout(() => {
								const inputs = document.querySelectorAll('.prod-chip input.chip-input');
								const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
								lastInput?.focus();
							}, 0);
						}
					}
				}}
			/>
			{#if grammarHistory.length > 0}
				<div class="history-container">
					<div class="history-title">History</div>
					<div class="history-list">
						{#each grammarHistory as hist}
							<button
								class="history-item"
								onclick={() => {
									rawGrammarInput = hist;
									if (!isRawMode) {
										const parts = hist
											.split(';')
											.map((p) => p.trim())
											.filter(Boolean);
										productions = parts.map((text) => ({ id: prodId++, text }));
										if (productions.length === 0) productions = [{ id: prodId++, text: 'S -> ' }];
									}
								}}
							>
								{hist.length > 60
									? hist.substring(0, 60).replace(/\n/g, ' ') + '...'
									: hist.replace(/\n/g, ' ')}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		{#if isRawMode}
			<textarea
				class="raw-grammar-textarea"
				bind:value={rawGrammarInput}
				placeholder="S -> A | B;&#10;A -> aA | ε"
				rows="6"
			></textarea>
			<button class="toggle-raw-btn" onclick={toggleRawMode}>Use Visual Editor</button>
		{:else}
			<div class="productions-flex">
				{#each productions as prod, index (prod.id)}
					<div
						class="prod-chip"
						onclick={() => {
							if (editingIndex !== index) startEdit(index);
						}}
					>
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
							<span class="chip-content">{prod.text}</span>
							<button
								class="remove-btn"
								onclick={(e) => {
									e.stopPropagation();
									removeProduction(index);
								}}>×</button
							>
						{/if}
					</div>
				{/each}
				<button class="add-chip" onclick={addProduction}>+</button>
			</div>
			<button class="toggle-raw-btn" onclick={toggleRawMode}>Use Raw Input</button>
		{/if}
	</div>

	<div class="controls-section">
		<div class="input-string">
			<label>Input:</label>
			<input bind:value={inputString} placeholder="String to parse" />
		</div>
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
	</div>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	{#if result}
		<div class="tabs-container">
			<div class="tabs">
				<button
					class="tab"
					class:active={activeTab === 'summary'}
					onclick={() => (activeTab = 'summary')}
				>
					Grammar summary
				</button>
				{#if firstData && followData}
					<button
						class="tab"
						class:active={activeTab === 'first_follow'}
						onclick={() => (activeTab = 'first_follow')}>First / Follow</button
					>
				{/if}
				{#if selectedParser === 'll1' || selectedParser === 'lr0' || selectedParser === 'lr1' || selectedParser === 'lalr1'}
					<button
						class="tab"
						class:active={activeTab === 'table'}
						onclick={() => (activeTab = 'table')}>Parsing Table</button
					>
				{/if}
				{#if selectedParser === 'lr0' || selectedParser === 'lr1' || selectedParser === 'lalr1'}
					<button
						class="tab"
						class:active={activeTab === 'items'}
						onclick={() => (activeTab = 'items')}>LR Items</button
					>
				{/if}
				{#if selectedParser === 'lr0' || selectedParser === 'lr1' || selectedParser === 'lalr1'}
					<button class="tab" class:active={activeTab === 'goto'} onclick={() => (activeTab = 'goto')}
						>AFN</button
					>
				{/if}
				{#if selectedParser === 'descent' && astSvg}
					<button class="tab" class:active={activeTab === 'ast'} onclick={() => (activeTab = 'ast')}
						>AST</button
					>
				{/if}
				{#if inputString.trim().length > 0}
					<button
						class="tab"
						class:active={activeTab === 'steps'}
						onclick={() => (activeTab = 'steps')}>Steps</button
					>
				{/if}
				<button
					class="tab tab-raw"
					class:active={activeTab === 'raw'}
					onclick={() => (activeTab = 'raw')}>JSON</button
				>
			</div>
			<div class="export-actions">
				<button class="export-btn png-btn" onclick={() => downloadTab('png')}>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
					PNG
				</button>
				<button class="export-btn pdf-btn" onclick={() => downloadTab('pdf')}>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
					PDF
				</button>
			</div>
		</div>
		<div class="tab-content" id="active-tab-content">
			{#if activeTab === 'summary'}
				<div class="grammar-summary">
					{#if parsedGrammar}
						<div class="summary-cards">
							<div class="summary-card">
								<div class="card-header">Productions</div>
								<div class="card-body">
									{#each parsedGrammar.productions as prod, i}
										<div class="production-row">
											<span class="prod-number">{i + 1}.</span>
											<span class="prod-parent">{prod.parent}</span>
											<span class="prod-arrow">→</span>
											<span class="prod-children">{prod.children.join(' | ')}</span>
										</div>
									{/each}
								</div>
							</div>
							<div class="summary-row">
								<div class="summary-card summary-card-half">
									<div class="card-header">Non-Terminals</div>
									<div class="card-body">
										<div class="symbol-badges">
											{#each [...parsedGrammar.non_terminals].sort() as nt}
												<span class="badge badge-nt">{nt}</span>
											{/each}
										</div>
									</div>
								</div>
								<div class="summary-card summary-card-half">
									<div class="card-header">Terminals</div>
									<div class="card-body">
										<div class="symbol-badges">
											{#each [...parsedGrammar.terminals].sort() as t}
												<span class="badge badge-t">{t}</span>
											{/each}
										</div>
									</div>
								</div>
							</div>
							<div class="summary-card">
								<div class="card-header">Parser Info</div>
								<div class="card-body">
									<div class="info-grid">
										<span class="info-label">Parser:</span>
										<span class="info-value"
											>{selectedParser === 'll1'
												? 'LL(1)'
												: selectedParser === 'lr0'
													? 'LR(0)'
													: selectedParser === 'lr1'
														? 'LR(1)'
														: selectedParser === 'lalr1'
															? 'LALR(1)'
															: 'Recursive Descent'}</span
										>
										<span class="info-label">Mode:</span>
										<span class="info-value"
											>{selectedMode === 'compact' ? 'Compact' : 'Spaced'}</span
										>
										<span class="info-label">Productions:</span>
										<span class="info-value">{parsedGrammar.productions.length}</span>
										<span class="info-label">Start Symbol:</span>
										<span class="info-value">{parsedGrammar.productions[0]?.parent || '—'}</span>
									</div>
								</div>
							</div>
							{#if conflicts.length > 0}
								<div class="summary-card summary-card-conflict">
									<div class="card-header card-header-conflict">
										⚠ Conflicts ({conflicts.length})
									</div>
									<div class="card-body">
										{#each conflicts as conflict}
											<div class="conflict-row">{conflict}</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'raw'}
				<pre>{JSON.stringify(result, null, 2)}</pre>
			{:else if activeTab === 'first_follow' && firstData && followData}
				<div class="first-follow-section">
					<h3>First Sets</h3>
					<table class="ff-table">
						<thead>
							<tr><th>Symbol</th><th>First</th></tr>
						</thead>
						<tbody>
							{#each [...firstData.entries()].sort(([a], [b]) => a.localeCompare(b)) as [sym, set]}
								<tr>
									<td class="nt-cell">{sym}</td>
									<td>{'{ ' + [...set].sort().join(', ') + ' }'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<h3>Follow Sets</h3>
					<table class="ff-table">
						<thead>
							<tr><th>Non-Terminal</th><th>Follow</th></tr>
						</thead>
						<tbody>
							{#each [...followData.entries()].sort(([a], [b]) => a.localeCompare(b)) as [nt, set]}
								<tr>
									<td class="nt-cell">{nt}</td>
									<td>{'{ ' + [...set].sort().join(', ') + ' }'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if activeTab === 'ast' && astSvg}
				<div class="svg-container">{@html astSvg}</div>
			{:else if activeTab === 'table'}
				{#if llTableData && selectedParser === 'll1'}
					<table class="ll-table">
						<thead>
							<tr>
								<th>NT</th>
								{#each llTableData.terminals as t, i (i)}
									<th>{t}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each llTableData.rows as row, ri (row.nt)}
								<tr>
									<td class="nt-cell">{row.nt}</td>
									{#each row.cells as cell, ci (ci)}
										<td>{cell || '-'}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				{:else if lrTableData && (selectedParser === 'lr0' || selectedParser === 'lr1' || selectedParser === 'lalr1')}
					<div class="table-wrapper">
						<table class="lr-table">
							<thead>
								<tr>
									<th>State</th>
									{#each lrTableData.headers as h, i (i)}
										<th>{h}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each lrTableData.rows as row, ri (row.state)}
									<tr>
										<td class="state-cell">{row.state}</td>
										{#each row.cells as cell, ci (ci)}
											<td
												class:shift={cell?.type === 'shift'}
												class:reduce={cell?.type === 'reduce'}
												class:goto={cell?.type === 'goto'}
												class:accept={cell?.type === 'accept'}
											>
												{cell?.value || '-'}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="loading-msg">Computing table...</p>
				{/if}
			{:else if activeTab === 'items'}
				{#if automatonSvg}
					<div class="automaton-svg">{@html automatonSvg}</div>
				{:else}
					<p class="loading-msg">Generating LR Items graph...</p>
				{/if}
			{:else if activeTab === 'goto'}
				{#if gotoSvg}
					<div class="automaton-svg">{@html gotoSvg}</div>
				{:else}
					<p class="loading-msg">Generating AFN graph...</p>
				{/if}
			{:else if activeTab === 'steps'}
				{#if parseSteps.length > 0}
					<table class="steps-table">
						<thead>
							<tr>
								<th>Step</th>
								<th>Stack</th>
								<th>Input</th>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>
							{#each parseSteps as step (step)}
								<tr>
									<td>{step.step}</td>
									<td class="stack-cell">{step.stack}</td>
									<td class="input-cell">{step.input}</td>
									<td class="action-cell" class:error={step.action.startsWith('Error')}
										>{step.action}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="loading-msg">No parse steps. Enter an input string and click Parse.</p>
				{/if}
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
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
		justify-content: space-between;
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

	.tabs-container {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		border-bottom: 2px solid #e9ecef;
		margin-top: 1.5rem;
	}

	.tabs {
		display: flex;
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

	.export-actions {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.export-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.8rem;
		border: 1px solid #ced4da;
		border-radius: 6px;
		background: #fff;
		font-size: 0.8rem;
		font-weight: 500;
		color: #495057;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.export-btn:hover {
		background: #f8f9fa;
		border-color: #adb5bd;
		color: #212529;
	}

	.export-btn svg {
		flex-shrink: 0;
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

	.table-wrapper {
		width: 100%;
		overflow-x: auto;
		background: #fff;
		border-radius: 8px;
		border: 1px solid #e9ecef;
	}

	.ll-table,
	.lr-table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'Fira Mono', monospace;
		font-size: 0.875rem;
		background: #fff;
		border-radius: 8px;
		overflow: hidden;
	}

	.ll-table th,
	.ll-table td,
	.lr-table th,
	.lr-table td {
		padding: 0.5rem 0.75rem;
		border: 1px solid #dee2e6;
		text-align: center;
	}

	.ll-table th,
	.lr-table th {
		background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
		font-weight: 600;
		color: #495057;
	}

	.nt-cell,
	.state-cell {
		background: #fafafa;
		font-weight: 600;
	}

	.ll-table tr:hover,
	.lr-table tr:hover {
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

	.steps-table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'Fira Mono', monospace;
		font-size: 0.85rem;
		background: #fff;
		border-radius: 8px;
		overflow: hidden;
	}

	.steps-table th,
	.steps-table td {
		padding: 0.5rem 0.75rem;
		border: 1px solid #dee2e6;
		text-align: left;
	}

	.steps-table th {
		background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
		font-weight: 600;
		color: #495057;
		text-align: center;
	}

	.steps-table tr:hover {
		background: #f8f9fa;
	}

	.steps-table .stack-cell,
	.steps-table .input-cell {
		font-family: 'Fira Mono', monospace;
	}

	.steps-table .action-cell {
		color: #27ae60;
		font-weight: 500;
	}

	.steps-table .action-cell.error {
		color: #dc3545;
	}

	.first-follow-section {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.first-follow-section h3 {
		font-size: 1rem;
		font-weight: 600;
		color: #495057;
		margin: 0;
	}

	.ff-table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'Fira Mono', monospace;
		font-size: 0.875rem;
		background: #fff;
		border-radius: 8px;
		overflow: hidden;
	}

	.ff-table th,
	.ff-table td {
		padding: 0.5rem 0.75rem;
		border: 1px solid #dee2e6;
		text-align: left;
	}

	.ff-table th {
		background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
		font-weight: 600;
		color: #495057;
	}

	.ff-table tr:hover {
		background: #f8f9fa;
	}

	.loading-msg {
		color: #6c757d;
		font-style: italic;
		padding: 1rem;
		text-align: center;
	}

	.grammar-summary {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.summary-cards {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.summary-row {
		display: flex;
		gap: 1rem;
	}

	.summary-card {
		background: #fff;
		border: 1px solid #e9ecef;
		border-radius: 8px;
		overflow: hidden;
		flex: 1;
	}

	.summary-card-half {
		flex: 1;
	}

	.card-header {
		background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
		padding: 0.75rem 1rem;
		font-weight: 600;
		color: #495057;
		border-bottom: 1px solid #e9ecef;
	}

	.card-body {
		padding: 1rem;
	}

	.production-row {
		display: flex;
		align-items: baseline;
		font-family: 'Fira Mono', monospace;
		padding: 0.25rem 0;
		font-size: 0.9rem;
	}

	.prod-number {
		color: #adb5bd;
		width: 2rem;
		text-align: right;
		margin-right: 0.5rem;
	}

	.prod-parent {
		color: #2c3e50;
		font-weight: 600;
	}

	.prod-arrow {
		margin: 0 0.5rem;
		color: #4a90d9;
	}

	.prod-children {
		color: #e67e22;
	}

	.symbol-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.badge {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-family: 'Fira Mono', monospace;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.badge-nt {
		background: #e3f2fd;
		color: #1565c0;
		border: 1px solid #bbdefb;
	}

	.badge-t {
		background: #f1f8e9;
		color: #33691e;
		border: 1px solid #dcedc8;
	}

	.info-grid {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.5rem 1rem;
		font-size: 0.9rem;
	}

	.info-label {
		color: #6c757d;
		font-weight: 600;
	}

	.info-value {
		font-family: 'Fira Mono', monospace;
		color: #212529;
	}

	.summary-card-conflict {
		border-color: #f5c6cb;
	}

	.card-header-conflict {
		background: #f8d7da;
		color: #721c24;
		border-bottom-color: #f5c6cb;
	}

	.conflict-row {
		color: #721c24;
		font-family: 'Fira Mono', monospace;
		font-size: 0.85rem;
		padding: 0.25rem 0;
	}

	.svg-container {
		display: flex;
		justify-content: center;
		align-items: center;
		overflow-x: auto;
		background: #fff;
		border: 1px solid #e9ecef;
		border-radius: 8px;
		padding: 1rem;
		min-height: 200px;
	}

	.svg-container :global(svg) {
		max-width: 100%;
		height: auto;
	}

	.keyboard-row {
		display: flex;
		justify-content: space-between;
		align-items: stretch;
		margin-bottom: 1rem;
		gap: 1.5rem;
	}

	.history-container {
		flex: 1.5;
		display: flex;
		flex-direction: column;
		border-radius: 1.5rem;
		background: #fff;
		padding: 1rem;
		box-sizing: border-box;
	}

	.history-title {
		font-size: 1.5rem;
		font-weight: bold;
		text-align: left;
		margin: 0 0 0.5rem 0;
		padding: 0;
		color: #212529;
	}

	.history-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 90px;
	}

	.history-item {
		flex-shrink: 0;
		padding: 0.4rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f9f9f9;
		text-align: left;
		font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
		font-size: 0.8rem;
		color: #212529;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: background 0.2s, padding-left 0.2s;
	}

	.history-item:hover {
		background: #e0e0e0;
		padding-left: 1rem;
	}

	@media (max-width: 768px) {
		.keyboard-row {
			flex-direction: column;
			align-items: stretch;
			gap: 1rem;
		}

		.history-container {
			flex: none;
			width: 100%;
		}

		.tabs-container {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
			border-bottom: none;
		}

		.tabs {
			overflow-x: auto;
			border-bottom: 2px solid #e9ecef;
			padding-bottom: 2px;
			white-space: nowrap;
			-webkit-overflow-scrolling: touch;
		}

		.export-actions {
			display: flex;
			width: 100%;
			margin-top: 0.25rem;
			margin-bottom: 0.5rem;
		}

		.export-btn {
			flex: 1;
			justify-content: center;
			padding: 0.6rem;
			font-size: 0.9rem;
		}
	}

	.toggle-raw-btn {
		background-color: #f8f9fa;
		border: 1px solid #ced4da;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		color: #495057;
		font-size: 0.9rem;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.2s ease;
	}

	.toggle-raw-btn:hover {
		background-color: #e9ecef;
		border-color: #adb5bd;
	}

	.raw-grammar-textarea {
		width: 100%;
		padding: 1rem;
		font-family: 'Fira Mono', monospace;
		font-size: 0.95rem;
		border: 1px solid #ced4da;
		border-radius: 8px;
		resize: vertical;
		background: #f8f9fa;
		color: #212529;
		margin-bottom: 1rem;
	}

	.raw-grammar-textarea:focus {
		outline: none;
		border-color: #80bdff;
		box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
	}

	.session-id {
		font-family: 'Fira Mono', monospace;
		font-size: 0.8rem;
		color: #6c757d;
		margin-left: 0.5rem;
	}
</style>

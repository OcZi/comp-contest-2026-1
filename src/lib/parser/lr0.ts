import type { Grammar, Production } from "$lib/grammars/grammar";

// Item LR(0): S -> a • A b
interface LR0Item {
  prod: Production
  alt: string[]   // la alternativa específica
  dot: number     // posición del punto
}

function item_key(item: LR0Item): string {
  return `${item.prod.parent}->${item.alt.join('')}@${item.dot}`;
}

function items_key(items: LR0Item[]): string {
  return [...items].map(item_key).sort().join('|');
}

// cierre de un conjunto de items
function closure_lr0(items: LR0Item[], g: Grammar): LR0Item[] {
  const result = [...items];
  const seen = new Set(result.map(item_key));

  let i = 0;
  while (i < result.length) {
    const item = result[i++];
    const sym = item.alt[item.dot]; // símbolo después del punto

    if (!sym || !g.non_terminals.has(sym)) continue;

    // agrega todas las producciones de sym con punto al inicio
    for (const prod of g.productions) {
      if (prod.parent !== sym) continue;
      for (const alt of prod.children) {
        const symbols = g.mode === 'compact' ? alt.split('') : alt.split(' ');
        const newItem: LR0Item = { prod, alt: symbols, dot: 0 };
        const key = item_key(newItem);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(newItem);
        }
      }
    }
  }

  return result;
}

// goto: mover el punto sobre un símbolo
function goto_lr0(items: LR0Item[], sym: string, g: Grammar): LR0Item[] {
  const moved = items
    .filter(item => item.alt[item.dot] === sym)
    .map(item => ({ ...item, dot: item.dot + 1 }));

  return closure_lr0(moved, g);
}

export interface LR0State {
  id: number
  items: LR0Item[]
}

export interface LR0Automaton {
  states: LR0State[]
  transitions: Map<string, number>  // "stateId,sym" -> stateId
}

export function compute_lr0(g: Grammar): LR0Automaton {
  const start_prod = g.productions[0];
  const start_alt = g.mode === 'compact'
    ? start_prod.children[0].split('')
    : start_prod.children[0].split(' ');

  const initial = closure_lr0([{ prod: start_prod, alt: start_alt, dot: 0 }], g);

  const states: LR0State[] = [{ id: 0, items: initial }];
  const transitions = new Map<string, number>();
  const seen = new Map<string, number>();
  seen.set(items_key(initial), 0);

  let i = 0;
  while (i < states.length) {
    const state = states[i++];

    // símbolos posibles después del punto
    const syms = new Set(
      state.items
        .map(item => item.alt[item.dot])
        .filter(Boolean) as string[]
    );

    for (const sym of syms) {
      const next = goto_lr0(state.items, sym, g);
      if (next.length === 0) continue;

      const key = items_key(next);
      if (!seen.has(key)) {
        const id = states.length;
        seen.set(key, id);
        states.push({ id, items: next });
      }

      transitions.set(`${state.id},${sym}`, seen.get(key)!);
    }
  }

  return { states, transitions };
}

// tabla de acción/goto LR(0)
type LR0Action =
  | { type: 'shift';  state: number }
  | { type: 'reduce'; prod: Production; alt: string[] }
  | { type: 'accept' }

export function compute_lr0_table(
  g: Grammar,
  automaton: LR0Automaton
): {
  action: Map<string, LR0Action>
  goto: Map<string, number>
  conflicts: string[]
} {
  const action = new Map<string, LR0Action>();
  const goto   = new Map<string, number>();
  const conflicts: string[] = [];

  const set = (key: string, val: LR0Action) => {
    if (action.has(key)) {
      const existing = action.get(key)!;
      if (existing.type === val.type) {
        if (existing.type === 'shift' && val.type === 'shift' && existing.state === val.state) return;
        if (existing.type === 'reduce' && val.type === 'reduce' && 
            existing.prod.parent === val.prod.parent && existing.alt.join('') === val.alt.join('')) return;
      }
      if (!conflicts.includes(`Conflicto LR(0) en ${key}`)) {
        conflicts.push(`Conflicto LR(0) en ${key}`);
      }
    } else {
      action.set(key, val);
    }
  };

  for (const state of automaton.states) {
    for (const item of state.items) {
      const sym = item.alt[item.dot];

      if (sym) {
        // shift
        const next = automaton.transitions.get(`${state.id},${sym}`);
        if (next !== undefined) {
          if (g.terminals.has(sym)) {
            set(`${state.id},${sym}`, { type: 'shift', state: next });
          } else {
            goto.set(`${state.id},${sym}`, next);
          }
        }
      } else {
        // reduce o accept
        if (item.prod.parent === g.productions[0].parent) {
          set(`${state.id},$`, { type: 'accept' });
        } else {
          for (const t of [...g.terminals, '$']) {
            set(`${state.id},${t}`, {
              type: 'reduce',
              prod: item.prod,
              alt: item.alt
            });
          }
        }
      }
    }
  }

  return { action, goto, conflicts };
}
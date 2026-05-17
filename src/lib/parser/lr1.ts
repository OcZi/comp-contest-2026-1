import type { Grammar } from "$lib/grammars/grammar";
import type { LR1Item, LR1State, LRAction } from "./parse_types";

// Item LR(1): [S -> a • A b, t]  donde t es el lookahead
function item_key_lr1(item: LR1Item): string {
  return `${item.prod.parent}->${item.alt.join('')}@${item.dot},${item.lookahead}`;
}

function closure_lr1(
  items: LR1Item[],
  g: Grammar,
  first: Map<string, Set<string>>
): LR1Item[] {
  const result = [...items];
  const seen = new Set(result.map(item_key_lr1));

  let i = 0;
  while (i < result.length) {
    const item = result[i++];
    const sym = item.alt[item.dot];

    if (!sym || !g.non_terminals.has(sym)) continue;

    // β a: resto después de sym + lookahead actual
    const beta = [...item.alt.slice(item.dot + 1), item.lookahead];

    // calcular FIRST(βa)
    const lookaheads = new Set<string>();
    let allEpsilon = true;

    for (const b of beta) {
      const firstB = first.get(b) ?? new Set([b]);
      for (const x of firstB) {
        if (x !== 'ε') lookaheads.add(x);
      }
      if (!firstB.has('ε')) { allEpsilon = false; break; }
    }
    if (allEpsilon) lookaheads.add('ε');

    // agrega items para cada producción de sym
    for (const prod of g.productions) {
      if (prod.parent !== sym) continue;
      for (const alt of prod.children) {
        const symbols = g.mode === 'compact' ? alt.split('') : alt.split(' ');
        for (const la of lookaheads) {
          const newItem: LR1Item = { prod, alt: symbols, dot: 0, lookahead: la };
          const key = item_key_lr1(newItem);
          if (!seen.has(key)) {
            seen.add(key);
            result.push(newItem);
          }
        }
      }
    }
  }

  return result;
}

function goto_lr1(
  items: LR1Item[],
  sym: string,
  g: Grammar,
  first: Map<string, Set<string>>
): LR1Item[] {
  const moved = items
    .filter(item => item.alt[item.dot] === sym)
    .map(item => ({ ...item, dot: item.dot + 1 }));

  return closure_lr1(moved, g, first);
}

export function compute_lr1(
  g: Grammar,
  first: Map<string, Set<string>>
): { states: LR1State[]; transitions: Map<string, number> } {
  const start_prod = g.productions[0];
  const start_alt = g.mode === 'compact'
    ? start_prod.children[0].split('')
    : start_prod.children[0].split(' ');

  const initial = closure_lr1(
    [{ prod: start_prod, alt: start_alt, dot: 0, lookahead: '$' }],
    g, first
  );

  const states: LR1State[] = [{ id: 0, items: initial }];
  const transitions = new Map<string, number>();
  const seen = new Map<string, number>();

  const state_key = (items: LR1Item[]) =>
    items.map(item_key_lr1).sort().join('|');

  seen.set(state_key(initial), 0);

  let i = 0;
  while (i < states.length) {
    const state = states[i++];

    const syms = new Set(
      state.items
        .map(item => item.alt[item.dot])
        .filter(Boolean) as string[]
    );

    for (const sym of syms) {
      const next = goto_lr1(state.items, sym, g, first);
      if (next.length === 0) continue;

      const key = state_key(next);
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

export function compute_lr1_table(
  g: Grammar,
  states: LR1State[],
  transitions: Map<string, number>
): {
  action: Map<string, LRAction>
  goto: Map<string, number>
  conflicts: string[]
} {
  const action = new Map<string, LRAction>();
  const goto   = new Map<string, number>();
  const conflicts: string[] = [];

  const set = (key: string, val: LRAction) => {
    if (action.has(key)) {
      conflicts.push(`Conflicto LR(1) en ${key}`);
    } else {
      action.set(key, val);
    }
  };

  for (const state of states) {
    for (const item of state.items) {
      const sym = item.alt[item.dot];

      if (sym) {
        const next = transitions.get(`${state.id},${sym}`);
        if (next !== undefined) {
          if (g.terminals.has(sym)) {
            set(`${state.id},${sym}`, { type: 'shift', state: next });
          } else {
            goto.set(`${state.id},${sym}`, next);
          }
        }
      } else {
        // reduce con lookahead específico — diferencia clave vs LR(0)
        if (item.prod.parent === g.productions[0].parent && item.lookahead === '$') {
          set(`${state.id},$`, { type: 'accept' });
        } else {
          set(`${state.id},${item.lookahead}`, {
            type: 'reduce',
            prod: item.prod,
            alt: item.alt
          });
        }
      }
    }
  }

  return { action, goto, conflicts };
}
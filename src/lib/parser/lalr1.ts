import type { Grammar } from "$lib/grammars/grammar";
import { compute_lr1 } from "./lr1";
import type { LR1Item, LR1State, LRAction } from "./parse_types";

// LALR fusiona estados LR(1) con el mismo core LR(0)
function core_key(items: LR1Item[]): string {
  return items
    .map(i => `${i.prod.parent}->${i.alt.join('')}@${i.dot}`)
    .sort()
    .join('|');
}

export function compute_lalr(
  g: Grammar,
  first: Map<string, Set<string>>
): {
  action: Map<string, LRAction>
  goto: Map<string, number>
  conflicts: string[]
} {
  const { states, transitions } = compute_lr1(g, first);

  // agrupar estados por core LR(0)
  const core_groups = new Map<string, LR1State[]>();
  for (const state of states) {
    const key = core_key(state.items);
    if (!core_groups.has(key)) core_groups.set(key, []);
    core_groups.get(key)!.push(state);
  }

  // mapear id original → id fusionado
  const id_map = new Map<number, number>();
  const merged_states: LR1State[] = [];

  for (const group of core_groups.values()) {
    const merged_id = merged_states.length;

    // fusionar lookaheads de todos los estados del grupo
    const merged_items = group[0].items.map((item, idx) => ({
      ...item,
      lookahead: [...new Set(group.flatMap(s => [s.items[idx].lookahead]))].join(',')
    }));

    merged_states.push({ id: merged_id, items: merged_items });
    for (const s of group) id_map.set(s.id, merged_id);
  }

  // remap transitions
  const merged_transitions = new Map<string, number>();
  for (const [key, target] of transitions) {
    const [sid, sym] = key.split(',');
    const new_sid = id_map.get(Number(sid))!;
    const new_target = id_map.get(target)!;
    merged_transitions.set(`${new_sid},${sym}`, new_target);
  }

  // construir tabla igual que LR(1) pero con estados fusionados
  const action = new Map<string, LRAction>();
  const goto   = new Map<string, number>();
  const conflicts: string[] = [];

  const set = (key: string, val: LRAction) => {
    if (action.has(key)) {
      conflicts.push(`Conflicto LALR en ${key}`);
    } else {
      action.set(key, val);
    }
  };

  for (const state of merged_states) {
    for (const item of state.items) {
      const sym = item.alt[item.dot];

      if (sym) {
        const next = merged_transitions.get(`${state.id},${sym}`);
        if (next !== undefined) {
          if (g.terminals.has(sym)) {
            set(`${state.id},${sym}`, { type: 'shift', state: next });
          } else {
            goto.set(`${state.id},${sym}`, next);
          }
        }
      } else {
        const lookaheads = item.lookahead.split(',');
        if (item.prod.parent === g.productions[0].parent && lookaheads.includes('$')) {
          set(`${state.id},$`, { type: 'accept' });
        } else {
          for (const la of lookaheads) {
            set(`${state.id},${la}`, {
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
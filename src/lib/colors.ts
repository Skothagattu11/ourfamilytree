import type { People } from '../types';
import { fam } from './family';

/** Muted, print-like inks — one per family line. */
export const LINE_COLORS = [
  '#2f7a6b', // teal
  '#c0623d', // terracotta
  '#4f63a8', // indigo
  '#b0852a', // ochre
  '#8a4f86', // plum
  '#5f8a4f', // moss
  '#b4506a', // rose
  '#3f7b9a', // slate blue
  '#8a6a4a', // walnut
  '#6a5fa8', // iris
];

/** Give any family without a colour the next unused one. Returns null when nothing changed. */
export function assignColors(people: People, colors: Record<string, string>) {
  const names = [...new Set(Object.values(people).map(fam))].sort();
  const missing = names.filter(n => !colors[n]);
  if (!missing.length) return null;
  const next = { ...colors };
  for (const n of missing) {
    const used = new Set(Object.values(next));
    next[n] = LINE_COLORS.find(c => !used.has(c)) || LINE_COLORS[Object.keys(next).length % LINE_COLORS.length];
  }
  return next;
}

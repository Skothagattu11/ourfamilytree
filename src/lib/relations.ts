import type { People } from '../types';
import { kidsOf } from './family';

function upDist(people: People, id: string) {
  const d = new Map([[id, 0]]), q = [id];
  while (q.length) {
    const x = q.shift()!;
    for (const p of people[x].parents) if (people[p] && !d.has(p)) { d.set(p, d.get(x)! + 1); q.push(p); }
  }
  return d;
}

/** Blood relationship: "a is b's ___". */
function term(people: People, a: string, b: string): string | null {
  const A = upDist(people, a), B = upDist(people, b);
  let best: { da: number; db: number } | null = null;
  for (const [x, da] of A) if (B.has(x)) {
    const db = B.get(x)!;
    if (!best || da + db < best.da + best.db) best = { da, db };
  }
  if (!best) return null;
  const { da, db } = best, s = people[a].sex;
  const g = (f: string, m: string, n: string) => (s === 'f' ? f : s === 'm' ? m : n);
  const gr = (n: number) => (n <= 0 ? '' : n === 1 ? 'great-' : n === 2 ? 'great-great-' : `${n}× great-`);
  if (!da && !db) return 'the same person';
  if (!da) return db === 1 ? g('mother', 'father', 'parent') : gr(db - 2) + 'grand' + g('mother', 'father', 'parent');
  if (!db) return da === 1 ? g('daughter', 'son', 'child') : gr(da - 2) + 'grand' + g('daughter', 'son', 'child');
  if (da === 1 && db === 1) return g('sister', 'brother', 'sibling');
  if (da === 1) return gr(db - 2) + g('aunt', 'uncle', 'aunt or uncle');
  if (db === 1) return gr(da - 2) + g('niece', 'nephew', 'niece or nephew');
  const deg = Math.min(da, db) - 1, rem = Math.abs(da - db);
  const ord = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'][deg] || `${deg}th`;
  return `${ord} cousin${rem ? (rem === 1 ? ' once removed' : rem === 2 ? ' twice removed' : ` ${rem}× removed`) : ''}`;
}

export function relation(people: People, a: string, b: string): string | null {
  const pa = people[a], pb = people[b];
  const g = (p: typeof pa, f: string, m: string, n: string) => (p.sex === 'f' ? f : p.sex === 'm' ? m : n);
  if (a === b) return 'the same person';
  if (pa.spouses.includes(b)) return g(pa, 'wife', 'husband', 'partner');
  const t = term(people, a, b);
  if (t) return t;
  for (const s of pb.spouses) {               // a is b's spouse's x
    const x = people[s] && term(people, a, s);
    if (!x) continue;
    if (/(mother|father|parent)$/.test(x) || /^(sister|brother|sibling)$/.test(x)) return `${x}-in-law`;
    return `${g(pb, 'husband', 'wife', 'partner')}'s ${x}`;
  }
  for (const s of pa.spouses) {               // a is the spouse of b's x
    const x = people[s] && term(people, s, b);
    if (!x) continue;
    if (/(daughter|son|child)$/.test(x)) return x.replace(/(daughter|son|child)$/, g(pa, 'daughter', 'son', 'child')) + '-in-law';
    if (/^(sister|brother|sibling)$/.test(x)) return g(pa, 'sister', 'brother', 'sibling') + '-in-law';
    if (/(aunt|uncle)/.test(x)) return `${g(pa, 'aunt', 'uncle', 'aunt or uncle')} by marriage`;
    return `${x}'s ${g(pa, 'wife', 'husband', 'partner')}`;
  }
  return null;
}

export function pathBetween(people: People, a: string, b: string): string[] | null {
  const prev: Record<string, string | null> = { [a]: null };
  const q = [a];
  while (q.length) {
    const x = q.shift()!;
    if (x === b) break;
    for (const n of [...people[x].parents, ...kidsOf(people, x), ...people[x].spouses])
      if (people[n] && !(n in prev)) { prev[n] = x; q.push(n); }
  }
  if (!(b in prev)) return null;
  const path: string[] = [];
  for (let c: string | null = b; c != null; c = prev[c]) path.unshift(c);
  return path;
}

import type { People, Person } from '../types';

export const yr = (v?: string): number | null => {
  const m = String(v || '').match(/\d{4}/);
  return m ? +m[0] : null;
};
export const fam = (p: Person) => p.surname.trim() || 'No family name';
export const fullName = (p: Person) => `${p.first || '?'} ${p.surname || ''}`.trim();
export const initials = (p: Person) =>
  p.placeholder ? '?' : ((p.first.trim()[0] || '') + (p.surname.trim()[0] || '')).toUpperCase() || '?';

export function yearsTxt(p: Person) {
  const b = yr(p.born) ?? (p.born || null), d = yr(p.died) ?? (p.died || null);
  // numbers only, so it reads the same in English and Telugu
  if (b && d) return `${b} – ${d}`;
  if (b) return `${b} –`;
  if (d) return `– ${d}`;
  return '';
}

export const all = (people: People) => Object.values(people);
export const kidsOf = (people: People, id: string) => all(people).filter(p => p.parents.includes(id)).map(p => p.id);
export const sibsOf = (people: People, id: string) => {
  const p = people[id];
  if (!p?.parents.length) return [];
  return all(people).filter(q => q.id !== id && q.parents.some(x => p.parents.includes(x))).map(q => q.id);
};

export function families(people: People) {
  const m: Record<string, Person[]> = {};
  all(people).forEach(p => (m[fam(p)] ||= []).push(p));
  return m;
}

/** Families joined by marriage (or a child carrying another family's name). */
export function familyLinks(people: People) {
  const w: Record<string, number> = {};
  const bump = (a: string, b: string, v: number) => {
    if (a === b) return;
    const k = [a, b].sort().join('|');
    w[k] = (w[k] || 0) + v;
  };
  all(people).forEach(p => {
    p.spouses.forEach(s => { const q = people[s]; if (q && p.id < s) bump(fam(p), fam(q), 1); });
    p.parents.forEach(pa => { const q = people[pa]; if (q) bump(fam(p), fam(q), 0.5); });
  });
  return w;
}

export function linkedFamilies(people: People, name: string) {
  return Object.keys(familyLinks(people))
    .filter(k => k.split('|').includes(name))
    .map(k => k.split('|').find(x => x !== name)!);
}

export function descendantsOf(people: People, id: string) {
  const s = new Set<string>(), st = kidsOf(people, id);
  while (st.length) { const x = st.pop()!; if (s.has(x)) continue; s.add(x); st.push(...kidsOf(people, x)); }
  return s;
}
export function ancestorsOf(people: People, id: string) {
  const s = new Set<string>(), st = [...(people[id]?.parents || [])];
  while (st.length) { const x = st.pop()!; if (s.has(x) || !people[x]) continue; s.add(x); st.push(...people[x].parents); }
  return s;
}
export function lineage(people: People, id: string) {
  return new Set([id, ...ancestorsOf(people, id), ...descendantsOf(people, id), ...(people[id]?.spouses || [])]);
}

/** Who is on screen when a set of families is open. */
export function visibleIds(people: People, fams: Set<string>, collapsed: Record<string, boolean>) {
  const B = new Set(all(people).filter(p => fams.has(fam(p))).map(p => p.id));
  const V = new Set(B);
  B.forEach(id => {
    people[id].spouses.forEach(s => people[s] && V.add(s));
    kidsOf(people, id).forEach(k => V.add(k));
  });
  const hidden = new Set<string>();
  for (const id of V) if (collapsed[id]) descendantsOf(people, id).forEach(k => hidden.add(k));
  for (const h of [...hidden]) people[h].spouses.forEach(s => {
    if (!V.has(s) || hidden.has(s)) return;
    const anchored = people[s].parents.some(x => V.has(x) && !hidden.has(x));
    if (!anchored) hidden.add(s);
  });
  hidden.forEach(h => V.delete(h));
  return [...V];
}

/** UUID v4 — works on plain http (phones on the LAN), where crypto.randomUUID is missing. */
export const uid = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export type LinkRel = 'parent' | 'child' | 'partner';
/** Why `personId` can't be the <rel> of `relativeId` — or null if the link is fine. */
export function linkProblem(people: People, personId: string, rel: LinkRel, relativeId: string): 'same' | 'exists' | 'twoParents' | 'ancestor' | null {
  const p = people[personId], r = people[relativeId];
  if (!p || !r || p.id === r.id) return 'same';
  if (rel === 'partner') return p.spouses.includes(r.id) ? 'exists' : null;
  const child = rel === 'child' ? p : r, parent = rel === 'child' ? r : p;
  if (child.parents.includes(parent.id)) return 'exists';
  if (child.parents.filter(x => people[x]).length >= 2) return 'twoParents';
  if (ancestorsOf(people, parent.id).has(child.id) || child.id === parent.id) return 'ancestor';
  return null;
}

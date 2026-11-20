import type { People } from '../types';
import { fam, yr } from './family';

export const NW = 188;   // card width
export const NH = 68;    // card height
const CG = 40;           // gap between partners
const HG = 28;           // gap between households
export const ROW = 160;  // generation spacing

export interface Layout {
  /** x = card centre, y = card top */
  pos: Record<string, { x: number; y: number }>;
  gen: Record<string, number>;
  couples: [string, string][];
  kids: { c: string; ps: string[] }[];
}

const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/**
 * Generation rows + households (partners side by side), then a few
 * barycentre sweeps so children sit under parents and parents over children.
 */
export function layout(people: People, ids: string[]): Layout {
  const set = new Set(ids);
  const P = (id: string) => people[id];
  const vp = (id: string) => P(id).parents.filter(x => set.has(x));
  const vs = (id: string) => P(id).spouses.filter(x => set.has(x));
  const kidMap: Record<string, string[]> = {};
  ids.forEach(id => (kidMap[id] = []));
  ids.forEach(id => vp(id).forEach(p => kidMap[p].push(id)));
  const vc = (id: string) => kidMap[id];

  const G: Record<string, number> = {};
  ids.forEach(id => (G[id] = 0));
  for (let it = 0; it < 80; it++) {
    let ch = false;
    for (const id of ids) {
      for (const p of vp(id)) if (G[id] < G[p] + 1) { G[id] = G[p] + 1; ch = true; }
      for (const s of vs(id)) { const m = Math.max(G[id], G[s]); if (G[id] !== m || G[s] !== m) { G[id] = G[s] = m; ch = true; } }
      if (!vp(id).length && vc(id).length) {
        const m = Math.min(...vc(id).map(k => G[k])) - 1;
        if (m > G[id]) { G[id] = m; ch = true; }
      }
    }
    if (!ch) break;
  }

  type Unit = { members: string[]; x: number };
  const sorted = ids.slice().sort((a, b) =>
    fam(P(a)).localeCompare(fam(P(b))) || (yr(P(a).born) || 9999) - (yr(P(b).born) || 9999));
  const unitOf: Record<string, Unit> = {};
  const rows: Record<number, Unit[]> = {};
  const mk = (id: string) => {
    const sp = vs(id).filter(s => G[s] === G[id] && !unitOf[s]);
    let members = [id, ...sp];
    if (sp.length >= 2) members = [sp[0], id, ...sp.slice(1)];
    const u: Unit = { members, x: 0 };
    members.forEach(m => (unitOf[m] = u));
    (rows[G[id]] ||= []).push(u);
  };
  sorted.filter(id => vs(id).filter(s => G[s] === G[id]).length >= 2).forEach(id => unitOf[id] || mk(id));
  sorted.forEach(id => unitOf[id] || mk(id));

  const uw = (u: Unit) => u.members.length * NW + (u.members.length - 1) * CG;
  const px = (id: string) => { const u = unitOf[id]; return u.x + u.members.indexOf(id) * (NW + CG) + NW / 2; };
  const gs = Object.keys(rows).map(Number).sort((a, b) => a - b);
  gs.forEach(g => { let x = 0; rows[g].forEach(u => { u.x = x; x += uw(u) + HG; }); });

  const sweep = (g: number, dir: -1 | 1) => {
    const row = rows[g];
    const ks = row.map(u => {
      const rel = u.members.flatMap(dir < 0 ? vp : vc);
      return rel.length ? avg(rel.map(px)) : u.x + uw(u) / 2;
    });
    const order = row.map((_, i) => i).sort((a, b) => ks[a] - ks[b]);
    let right = -Infinity, shift = 0;
    order.forEach(i => {
      const u = row[i], w = uw(u);
      let l = ks[i] - w / 2;
      if (l < right + HG) l = right + HG;
      u.x = l; right = l + w; shift += ks[i] - (l + w / 2);
    });
    shift /= order.length;
    order.forEach(i => (row[i].x += shift));
    rows[g] = order.map(i => row[i]);
  };
  for (let it = 0; it < 4; it++) {
    gs.forEach(g => sweep(g, -1));
    [...gs].reverse().forEach(g => sweep(g, 1));
  }

  const pos: Layout['pos'] = {};
  ids.forEach(id => (pos[id] = { x: px(id), y: gs.indexOf(G[id]) * ROW }));
  if (ids.length) {
    const minX = Math.min(...ids.map(id => pos[id].x));
    ids.forEach(id => (pos[id].x -= minX));
  }

  const couples: [string, string][] = [];
  ids.forEach(a => vs(a).forEach(b => { if (a < b && G[a] === G[b]) couples.push([a, b]); }));
  const kids = ids.filter(c => vp(c).length).map(c => ({ c, ps: vp(c) }));
  return { pos, gen: G, couples, kids };
}

import type { People, Person } from '../types';
import { yr } from './family';

/**
 * Telugu kinship words, following the Dravidian pattern Telugu uses:
 *  - the word family depends on the GENERATION of the person relative to you
 *    (grandparent level, parent level, your level, child level, grandchild level);
 *  - within a generation, relatives are PARALLEL (linked through same-sex siblings →
 *    treated like your own parents / siblings / children) or CROSS (linked through
 *    opposite-sex siblings → మామయ్య, అత్తయ్య, బావ, మరదలు, మేనల్లుడు…). Crossness is carried
 *    down the whole chain, so it works for second and third cousins too;
 *  - elder / younger needs birth years — without them we show both words;
 *  - beyond the immediate family we prefix "వరుసకు" ("by relation"), as people say it.
 */
export interface TeTerm { te: string; tr: string }
const W = (te: string, tr: string): TeTerm => ({ te, tr });
const either = (a: TeTerm, b: TeTerm): TeTerm => W(`${a.te} / ${b.te}`, `${a.tr} / ${b.tr}`);
const varusa = (t: TeTerm): TeTerm => W(`వరుసకు ${t.te}`, `varusaku ${t.tr}`);

/** Is a older than b? null when we can't tell. */
function older(a?: Person, b?: Person): boolean | null {
  const ya = yr(a?.born), yb = yr(b?.born);
  if (!ya || !yb || ya === yb) return null;
  return ya < yb;
}
const byAge = (o: boolean | null, elder: TeTerm, younger: TeTerm) => (o === true ? elder : o === false ? younger : either(elder, younger));

// ---------------------------------------------------------------- words
const T = {
  amma: W('అమ్మ', 'amma'), nanna: W('నాన్న', 'nanna'), parent: W('తల్లి / తండ్రి', 'talli / tandri'),
  tatayya: W('తాతయ్య', 'tatayya'), nannamma: W('నాన్నమ్మ', 'nannamma'), ammamma: W('అమ్మమ్మ', 'ammamma'),
  muttata: W('ముత్తాత', 'muttata'), muttavva: W('ముత్తవ్వ', 'muttavva'), purvikulu: W('పూర్వీకులు', 'purvikulu'),
  koduku: W('కొడుకు', 'koduku'), kuthuru: W('కూతురు', 'kuthuru'), bidda: W('బిడ్డ', 'bidda'),
  manavadu: W('మనవడు', 'manavadu'), manavaralu: W('మనవరాలు', 'manavaralu'),
  munimanavadu: W('మునిమనవడు', 'munimanavadu'), munimanavaralu: W('మునిమనవరాలు', 'munimanavaralu'), varasulu: W('వారసులు', 'varasulu'),
  annayya: W('అన్నయ్య', 'annayya'), thammudu: W('తమ్ముడు', 'thammudu'), akka: W('అక్క', 'akka'), chellelu: W('చెల్లెలు', 'chellelu'),
  sibling: W('తోబుట్టువు', 'thobuttuvu'),
  pedananna: W('పెదనాన్న', 'pedananna'), babai: W('బాబాయి', 'babai'), peddamma: W('పెద్దమ్మ', 'peddamma'), pinni: W('పిన్ని', 'pinni'),
  mamayya: W('మామయ్య', 'mamayya'), attayya: W('అత్తయ్య', 'attayya'),
  bava: W('బావ', 'bava'), bavamaridi: W('బావమరిది', 'bavamaridi'), maridi: W('మరిది', 'maridi'),
  vadina: W('వదిన', 'vadina'), maradalu: W('మరదలు', 'maradalu'),
  menalludu: W('మేనల్లుడు', 'menalludu'), menakodalu: W('మేనకోడలు', 'menakodalu'),
  bharya: W('భార్య', 'bharya'), bharta: W('భర్త', 'bharta'), spouse: W('జీవిత భాగస్వామి', 'jeevita bhagaswami'),
  mamagaru: W('మామగారు', 'mamagaru'), attagaru: W('అత్తగారు', 'attagaru'),
  kodalu: W('కోడలు', 'kodalu'), alludu: W('అల్లుడు', 'alludu'),
  bavagaru: W('బావగారు', 'bavagaru'), adapaduchu: W('ఆడపడుచు', 'adapaduchu'),
  savatiTalli: W('సవతి తల్లి', 'savati talli'), savatiTandri: W('సవతి తండ్రి', 'savati tandri'),
  savatiKoduku: W('సవతి కొడుకు', 'savati koduku'), savatiKuthuru: W('సవతి కూతురు', 'savati kuthuru'),
};
const grandmother = (side?: Person) =>
  side?.sex === 'm' ? T.nannamma : side?.sex === 'f' ? T.ammamma : either(T.nannamma, T.ammamma);

// ---------------------------------------------------------------- blood links
/** Shortest climb from x to every ancestor: anc -> [x, parent, ..., anc]. */
function chains(people: People, x: string) {
  const m = new Map<string, string[]>([[x, [x]]]);
  const q = [x];
  while (q.length) {
    const c = q.shift()!;
    for (const p of people[c]?.parents || []) if (people[p] && !m.has(p)) { m.set(p, [...m.get(c)!, p]); q.push(p); }
  }
  return m;
}

/** How alter (a) sits relative to ego (b) by blood. */
interface Kin {
  da: number; db: number;        // steps up from alter / ego to the common ancestor
  g: number;                     // generation of alter relative to ego (+1 = parent level)
  direct: boolean;               // straight up or down the line
  cross: 0 | 1 | null;           // parallel (0) / cross (1); null when a sex on the chain is unknown
  ref?: Person;                  // ego-side relative in alter's generation (for elder/younger), or alter's parent (child level)
  side?: Person;                 // ego's parent on the chain (father's side vs mother's side)
  immediate: boolean;            // sibling, parent's sibling, sibling's child, first cousin
}
function kin(people: People, a: string, b: string): Kin | null {
  const A = chains(people, a), B = chains(people, b);
  let best: { ca: string[]; cb: string[] } | null = null;
  for (const [anc, ca] of A) {
    const cb = B.get(anc);
    if (cb && (!best || ca.length + cb.length < best.ca.length + best.cb.length)) best = { ca, cb };
  }
  if (!best) return null;
  const { ca, cb } = best;
  const da = ca.length - 1, db = cb.length - 1, g = db - da;
  const P = (id: string) => people[id];
  if (!da || !db) return { da, db, g, direct: true, cross: 0, side: db ? P(cb[1]) : undefined, immediate: true };

  // walk down from the two siblings under the common ancestor, carrying crossness
  const steps = Math.min(da, db) - 1;
  let cross: 0 | 1 | null = 0;
  for (let t = 0; t < steps && cross !== null; t++) {
    const x = P(cb[db - 1 - t]), y = P(ca[da - 1 - t]);
    cross = !x.sex || !y.sex ? null : ((cross ^ (x.sex !== y.sex ? 1 : 0)) as 0 | 1);
  }
  const x = P(cb[db - 1 - steps]), y = P(ca[da - 1 - steps]);  // the pair where one chain ends
  if (g !== 0 && cross !== null) cross = !x.sex || !y.sex ? null : ((cross ^ (x.sex !== y.sex ? 1 : 0)) as 0 | 1);
  return { da, db, g, direct: false, cross, ref: g > 0 ? x : y, side: P(cb[1]), immediate: da <= 2 && db <= 2 };
}

/** What ego (b) calls alter (a), given how they're related by blood. */
function bloodWord(people: People, A: Person, B: Person, k: Kin): TeTerm | null {
  const s = A.sex;
  const pick = (f: TeTerm, m: TeTerm, n: TeTerm | null = null) => (s === 'f' ? f : s === 'm' ? m : n);

  if (k.direct) {
    if (k.da === 0 && k.db === 0) return null;
    if (k.da === 0) {                                   // ancestor
      if (k.db === 1) return pick(T.amma, T.nanna, T.parent);
      if (k.db === 2) return pick(grandmother(k.side), T.tatayya, either(T.tatayya, grandmother(k.side)));
      if (k.db === 3) return pick(T.muttavva, T.muttata, either(T.muttata, T.muttavva));
      return T.purvikulu;
    }
    if (k.da === 1) return pick(T.kuthuru, T.koduku, T.bidda);  // descendant
    if (k.da === 2) return pick(T.manavaralu, T.manavadu, either(T.manavadu, T.manavaralu));
    if (k.da === 3) return pick(T.munimanavaralu, T.munimanavadu, T.munimanavadu);
    return T.varasulu;
  }

  let w: TeTerm | null = null;
  const c = k.cross;
  if (k.g >= 2) {                                       // grandparent level and above
    w = k.g === 2 ? pick(grandmother(k.side), T.tatayya) : pick(T.muttavva, T.muttata);
  } else if (k.g === 1) {                               // parent level
    if (c === null) return null;
    const o = older(A, k.ref);
    w = s === 'm' ? (c ? T.mamayya : byAge(o, T.pedananna, T.babai))
      : s === 'f' ? (c ? T.attayya : byAge(o, T.peddamma, T.pinni)) : null;
  } else if (k.g === 0) {                               // your level
    if (c === null) return null;
    const o = older(A, B);
    if (!c) w = s === 'm' ? byAge(o, T.annayya, T.thammudu) : s === 'f' ? byAge(o, T.akka, T.chellelu) : T.sibling;
    else if (s === 'm') w = o === true ? T.bava : o === false ? (B.sex === 'm' ? T.bavamaridi : B.sex === 'f' ? T.maridi : either(T.bavamaridi, T.maridi)) : either(T.bava, T.maridi);
    else if (s === 'f') w = byAge(o, T.vadina, T.maradalu);
  } else if (k.g === -1) {                              // child level
    if (c === null) return null;
    if (c) w = pick(T.menakodalu, T.menalludu);
    else if (k.da === 2 && k.db === 1 && k.ref) {        // own sibling's child: "తమ్ముడి కొడుకు"
      const S = k.ref, o = older(S, B);
      const sib = S.sex === 'm' ? (o === true ? W('అన్నయ్య', 'annayya') : o === false ? W('తమ్ముడి', 'thammudi') : W('సోదరుడి', 'sodarudi'))
        : (o === true ? W('అక్క', 'akka') : o === false ? W('చెల్లెలి', 'chelleli') : W('సోదరి', 'sodari'));
      const kid = pick(T.kuthuru, T.koduku, T.bidda)!;
      return W(`${sib.te} ${kid.te}`, `${sib.tr} ${kid.tr}`);
    } else w = pick(T.kuthuru, T.koduku, T.bidda);
  } else if (k.g === -2) w = pick(T.manavaralu, T.manavadu);
  else w = pick(T.munimanavaralu, T.munimanavadu);

  return w && !k.immediate ? varusa(w) : w;
}

// ---------------------------------------------------------------- by marriage
/** a is the spouse of X, who is b's blood relative: what b calls a. */
function spouseOfRelative(people: People, A: Person, X: Person, B: Person, k: Kin): TeTerm | null {
  const s = A.sex;
  const v = (t: TeTerm | null) => (t && !k.immediate && !k.direct ? varusa(t) : t);
  if (k.direct && k.da === 0) {                          // X is b's ancestor, a isn't
    if (k.db === 1) return s === 'f' ? T.savatiTalli : s === 'm' ? T.savatiTandri : null;
    if (k.db === 2) return s === 'f' ? grandmother(k.side) : s === 'm' ? T.tatayya : null;
    return null;
  }
  if (k.direct) {                                        // X is b's descendant
    if (k.da === 1) return s === 'f' ? T.kodalu : s === 'm' ? T.alludu : null;
    if (k.da === 2) return X.sex === 'm' ? W('మనవడి భార్య', 'manavadi bharya') : X.sex === 'f' ? W('మనవరాలి భర్త', 'manavarali bharta') : null;
    return null;
  }
  if (k.g >= 2) return v(s === 'f' ? grandmother(k.side) : s === 'm' ? T.tatayya : null);
  if (k.g === 1) {
    if (k.cross === null) return null;
    const o = older(X, k.ref);
    if (X.sex === 'm' && s === 'f') return v(k.cross ? T.attayya : byAge(o, T.peddamma, T.pinni));
    if (X.sex === 'f' && s === 'm') return v(k.cross ? T.mamayya : byAge(o, T.pedananna, T.babai));
    return null;
  }
  if (k.g === 0) {
    const o = older(X, B);
    if (X.sex === 'm' && s === 'f') return v(byAge(o, T.vadina, T.maradalu));
    if (X.sex === 'f' && s === 'm') return v(byAge(o, T.bava, T.maridi));
    return null;
  }
  if (k.g === -1) return v(s === 'f' ? T.kodalu : s === 'm' ? T.alludu : null);
  return null;
}

/** a is b's spouse S's blood relative: what b calls a. */
function relativeOfSpouse(people: People, A: Person, S: Person, B: Person, k: Kin): TeTerm | null {
  const s = A.sex;
  if (k.direct && k.da === 0 && k.db === 1) return s === 'm' ? T.mamagaru : s === 'f' ? T.attagaru : null;
  if (k.direct && k.da === 1 && k.db === 0) return s === 'm' ? T.savatiKoduku : s === 'f' ? T.savatiKuthuru : null;
  if (!k.direct && k.da === 1 && k.db === 1) {           // spouse's sibling
    if (S.sex === 'm') return s === 'm' ? byAge(older(A, S), T.bavagaru, T.maridi) : s === 'f' ? T.adapaduchu : null;
    if (S.sex === 'f') return s === 'm' ? T.bavamaridi : s === 'f' ? byAge(older(A, S), T.vadina, T.maradalu) : null;
  }
  // anyone else: what your spouse calls them, "on your wife's / husband's side"
  const w = bloodWord(people, A, S, k);
  if (!w) return null;
  const side = S.sex === 'm' ? W('భర్త తరఫు', 'bharta tarafu') : S.sex === 'f' ? W('భార్య తరఫు', 'bharya tarafu') : W('భాగస్వామి తరఫు', 'bhagaswami tarafu');
  return W(`${side.te} ${w.te}`, `${side.tr} ${w.tr}`);
}

/** What b calls a. Null when there's no Telugu word we can be sure of. */
export function teluguRelation(people: People, a: string, b: string): TeTerm | null {
  const A = people[a], B = people[b];
  if (!A || !B || a === b) return null;
  if (A.spouses.includes(b)) return A.sex === 'f' ? T.bharya : A.sex === 'm' ? T.bharta : T.spouse;

  const k = kin(people, a, b);
  if (k) return bloodWord(people, A, B, k);

  for (const xId of A.spouses) {                         // a married into b's family
    const X = people[xId];
    const kx = X && kin(people, xId, b);
    if (kx) { const w = spouseOfRelative(people, A, X, B, kx); if (w) return w; }
  }
  for (const sId of B.spouses) {                          // a is from b's spouse's family
    const S = people[sId];
    const ks = S && kin(people, a, sId);
    if (ks) { const w = relativeOfSpouse(people, A, S, B, ks); if (w) return w; }
  }
  return null;
}

export const DISTANT: TeTerm = W('దూరపు బంధువు', 'durapu bandhuvu');

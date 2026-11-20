import type { People, Person } from '../types';
import { yr } from './family';

/** A Telugu kinship term plus its romanised reading. */
export interface TeTerm { te: string; tr: string }
const W = (te: string, tr: string): TeTerm => ({ te, tr });
const either = (a: TeTerm, b: TeTerm): TeTerm => W(`${a.te} / ${b.te}`, `${a.tr} / ${b.tr}`);

/** Is a older than b? null when we can't tell. */
function older(a?: Person, b?: Person): boolean | null {
  const ya = yr(a?.born), yb = yr(b?.born);
  if (!ya || !yb || ya === yb) return null;
  return ya < yb;
}
const byAge = (o: boolean | null, elder: TeTerm, younger: TeTerm) => (o === true ? elder : o === false ? younger : either(elder, younger));

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

interface Blood { da: number; db: number; ca: string[]; cb: string[] }
function blood(people: People, a: string, b: string): Blood | null {
  const A = chains(people, a), B = chains(people, b);
  let best: Blood | null = null;
  for (const [anc, ca] of A) {
    const cb = B.get(anc);
    if (!cb) continue;
    if (!best || ca.length + cb.length < best.ca.length + best.cb.length) best = { da: ca.length - 1, db: cb.length - 1, ca, cb };
  }
  return best;
}

const sibTerm = (x: Person, ego: Person) =>
  x.sex === 'm' ? byAge(older(x, ego), W('అన్నయ్య', 'annayya'), W('తమ్ముడు', 'thammudu'))
    : x.sex === 'f' ? byAge(older(x, ego), W('అక్క', 'akka'), W('చెల్లెలు', 'chellelu'))
      : W('తోబుట్టువు', 'thobuttuvu');

/** Oblique ("of") form of a sibling word, for phrases like "తమ్ముడి కొడుకు". */
const sibOf = (x: Person, ego: Person) => {
  const o = older(x, ego);
  if (x.sex === 'm') return o === true ? W('అన్నయ్య', 'annayya') : o === false ? W('తమ్ముడి', 'thammudi') : W('సోదరుడి', 'sodarudi');
  if (x.sex === 'f') return o === true ? W('అక్క', 'akka') : o === false ? W('చెల్లెలి', 'chelleli') : W('సోదరి', 'sodari');
  return W('తోబుట్టువు', 'thobuttuvu');
};

/** Parent's sibling, as ego (via parent P) calls them. */
function uncleAunt(x: Person, P: Person): TeTerm | null {
  if (P.sex === 'm') return x.sex === 'm' ? byAge(older(x, P), W('పెదనాన్న', 'pedananna'), W('బాబాయి', 'babai')) : x.sex === 'f' ? W('అత్తయ్య', 'attayya') : null;
  if (P.sex === 'f') return x.sex === 'f' ? byAge(older(x, P), W('పెద్దమ్మ', 'peddamma'), W('పిన్ని', 'pinni')) : x.sex === 'm' ? W('మామయ్య', 'mamayya') : null;
  return null;
}
const grandmother = (P?: Person) =>
  P?.sex === 'm' ? W('నాన్నమ్మ', 'nannamma') : P?.sex === 'f' ? W('అమ్మమ్మ', 'ammamma') : either(W('నాన్నమ్మ', 'nannamma'), W('అమ్మమ్మ', 'ammamma'));

/** What b calls a, by blood. */
function bloodTerm(people: People, a: string, b: string): TeTerm | null {
  const r = blood(people, a, b);
  if (!r) return null;
  const A = people[a], B = people[b];
  const { da, db, ca, cb } = r;
  const s = A.sex;
  if (!da && !db) return null;
  if (!da) {                                       // a is an ancestor of b
    if (db === 1) return s === 'f' ? W('అమ్మ', 'amma') : s === 'm' ? W('నాన్న', 'nanna') : W('తల్లి / తండ్రి', 'talli / tandri');
    if (db === 2) return s === 'm' ? W('తాతయ్య', 'tatayya') : s === 'f' ? grandmother(people[cb[1]]) : W('తాతయ్య / అవ్వ', 'tatayya / avva');
    if (db === 3) return s === 'm' ? W('ముత్తాత', 'muttata') : s === 'f' ? W('ముత్తవ్వ', 'muttavva') : W('ముత్తాత / ముత్తవ్వ', 'muttata / muttavva');
    return W('పూర్వీకులు', 'purvikulu');
  }
  if (!db) {                                       // a is a descendant of b
    if (da === 1) return s === 'm' ? W('కొడుకు', 'koduku') : s === 'f' ? W('కూతురు', 'kuthuru') : W('బిడ్డ', 'bidda');
    if (da === 2) return s === 'm' ? W('మనవడు', 'manavadu') : s === 'f' ? W('మనవరాలు', 'manavaralu') : W('మనవడు / మనవరాలు', 'manavadu / manavaralu');
    if (da === 3) return s === 'm' ? W('మునిమనవడు', 'munimanavadu') : s === 'f' ? W('మునిమనవరాలు', 'munimanavaralu') : W('మునిమనవడు', 'munimanavadu');
    return W('వారసులు', 'varasulu');
  }
  if (da === 1 && db === 1) return sibTerm(A, B);
  if (da === 1 && db === 2) return uncleAunt(A, people[cb[1]]);
  if (da === 1 && db === 3) return s === 'm' ? W('తాతయ్య', 'tatayya') : s === 'f' ? grandmother(people[cb[1]]) : null;
  if (da === 2 && db === 1) {                      // child of b's sibling S
    const S = people[ca[1]];
    const kid = s === 'm' ? W('కొడుకు', 'koduku') : s === 'f' ? W('కూతురు', 'kuthuru') : W('బిడ్డ', 'bidda');
    if (S.sex && B.sex && S.sex !== B.sex) return s === 'm' ? W('మేనల్లుడు', 'menalludu') : s === 'f' ? W('మేనకోడలు', 'menakodalu') : null;
    const so = sibOf(S, B);
    return W(`${so.te} ${kid.te}`, `${so.tr} ${kid.tr}`);
  }
  if (da === 2 && db === 2) {                      // first cousins
    const P = people[cb[1]], Q = people[ca[1]];
    if (!P.sex || !Q.sex) return null;
    if (P.sex === Q.sex) return sibTerm(A, B);     // parallel cousins are called like siblings
    const o = older(A, B);                         // cross cousins
    if (s === 'm') return o === true ? W('బావ', 'bava')
      : o === false ? (B.sex === 'm' ? W('బావమరిది', 'bavamaridi') : B.sex === 'f' ? W('మరిది', 'maridi') : either(W('బావమరిది', 'bavamaridi'), W('మరిది', 'maridi')))
        : either(W('బావ', 'bava'), W('మరిది', 'maridi'));
    if (s === 'f') return byAge(o, W('వదిన', 'vadina'), W('మరదలు', 'maradalu'));
    return null;
  }
  if (da === 2 && db === 3) return uncleAunt(A, people[cb[1]]); // parent's cousin ≈ parent's sibling
  return null;
}

/** What b calls a — blood first, then by marriage. Null when there's no Telugu word we can be sure of. */
export function teluguRelation(people: People, a: string, b: string): TeTerm | null {
  const A = people[a], B = people[b];
  if (!A || !B || a === b) return null;
  if (A.spouses.includes(b)) return A.sex === 'f' ? W('భార్య', 'bharya') : A.sex === 'm' ? W('భర్త', 'bharta') : W('జీవిత భాగస్వామి', 'jeevita bhagaswami');
  const bt = bloodTerm(people, a, b);
  if (bt) return bt;

  // a is a blood relative of b's spouse S
  for (const sId of B.spouses) {
    const S = people[sId]; if (!S) continue;
    const r = blood(people, a, sId); if (!r) continue;
    if (r.da === 0 && r.db === 1) return A.sex === 'm' ? W('మామగారు', 'mamagaru') : A.sex === 'f' ? W('అత్తగారు', 'attagaru') : null;
    if (r.da === 1 && r.db === 1) {
      if (S.sex === 'm') return A.sex === 'm' ? byAge(older(A, S), W('బావగారు', 'bavagaru'), W('మరిది', 'maridi')) : A.sex === 'f' ? W('ఆడపడుచు', 'adapaduchu') : null;
      if (S.sex === 'f') return A.sex === 'm' ? W('బావమరిది', 'bavamaridi') : A.sex === 'f' ? byAge(older(A, S), W('వదిన', 'vadina'), W('మరదలు', 'maradalu')) : null;
    }
    const side = S.sex === 'm' ? W('భర్త వైపు బంధువు', 'bharta vaipu bandhuvu') : S.sex === 'f' ? W('భార్య వైపు బంధువు', 'bharya vaipu bandhuvu') : null;
    if (side) return side;
  }

  // a is the spouse of b's blood relative X
  for (const xId of A.spouses) {
    const X = people[xId]; if (!X) continue;
    const r = blood(people, xId, b); if (!r) continue;
    if (r.da === 1 && r.db === 0) return A.sex === 'f' ? W('కోడలు', 'kodalu') : A.sex === 'm' ? W('అల్లుడు', 'alludu') : null;
    if (r.da === 1 && r.db === 1) {
      const o = older(X, B);
      if (X.sex === 'm' && A.sex === 'f') return byAge(o, W('వదిన', 'vadina'), W('మరదలు', 'maradalu'));
      if (X.sex === 'f' && A.sex === 'm') return byAge(o, W('బావ', 'bava'), W('మరిది', 'maridi'));
    }
    if (r.da === 1 && r.db === 2) {
      const P = people[r.cb[1]], ox = older(X, P);
      if (P.sex === 'm' && X.sex === 'm' && A.sex === 'f') return byAge(ox, W('పెద్దమ్మ', 'peddamma'), W('పిన్ని', 'pinni'));
      if (P.sex === 'm' && X.sex === 'f' && A.sex === 'm') return W('మామయ్య', 'mamayya');
      if (P.sex === 'f' && X.sex === 'f' && A.sex === 'm') return byAge(ox, W('పెదనాన్న', 'pedananna'), W('బాబాయి', 'babai'));
      if (P.sex === 'f' && X.sex === 'm' && A.sex === 'f') return W('అత్తయ్య', 'attayya');
    }
    if (r.da === 2 && r.db === 0) return X.sex === 'm' ? W('మనవడి భార్య', 'manavadi bharya') : X.sex === 'f' ? W('మనవరాలి భర్త', 'manavarali bharta') : null;
  }
  return null;
}

export const DISTANT: TeTerm = W('దూరపు బంధువు', 'durapu bandhuvu');

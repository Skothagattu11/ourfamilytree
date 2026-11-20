import { create } from 'zustand';
import { useData, useUI, goTo, openFamilies } from '../../store';
import type { People, Person, Sex } from '../../types';
import { ancestorsOf, fam, families, fullName, kidsOf, sibsOf, yr } from '../family';
import { pathBetween, relation } from '../relations';
import { teluguRelation } from '../telugu';

/** A change the assistant has prepared but not saved. Shown as a card the user can confirm. */
export interface Proposal {
  id: string;
  kind: 'add' | 'update' | 'link' | 'remove';
  summary: string;
  missing: string[];
  icon: 'child' | 'partner' | 'parent' | 'sibling' | 'people' | 'notes' | 'link' | 'seedling';
  state: 'pending' | 'saved' | 'cancelled';
  /** Removals need two confirmations: the first one only arms it. */
  armed?: boolean;
  apply: () => string | undefined; // returns the affected person id
}

export const useProposals = create<{ list: Proposal[] }>(() => ({ list: [] }));
let seq = 0;

type Args = Record<string, unknown>;
type Res = Record<string, unknown> & { status: string; message?: string };

const people = (): People => useData.getState().people;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : typeof v === 'string' && /^\d{4}$/.test(v.trim()) ? +v : null);
const sexOf = (v: unknown): Sex | undefined => (v === 'female' ? 'f' : v === 'male' ? 'm' : v === 'unknown' ? '' : undefined);
const sexWord = (s: Sex) => (s === 'f' ? 'female' : s === 'm' ? 'male' : 'unknown');
const thisYear = new Date().getFullYear();
const okYear = (y: number | null) => y === null || (y >= 1700 && y <= thisYear);

function brief(p: Person, ps = people()) {
  return {
    id: p.id,
    name: p.placeholder ? 'Unknown (placeholder)' : fullName(p),
    family: fam(p),
    gender: sexWord(p.sex),
    born: yr(p.born) ?? (p.born || null),
    died: yr(p.died) ?? (p.died || null),
    parents: p.parents.filter(x => ps[x]).map(x => fullName(ps[x])),
    partners: p.spouses.filter(x => ps[x]).map(x => fullName(ps[x])),
  };
}
const nameOf = (id: string) => (people()[id] ? fullName(people()[id]) : '?');

/** Forgiving name search: prefixes, substrings and one-letter typos. */
function search(q: string) {
  const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, '');
  const toks = norm(q).split(/\s+/).filter(Boolean);
  const close = (a: string, b: string) => {
    if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  };
  return Object.values(people())
    .filter(p => !p.placeholder)
    .map(p => {
      const words = norm(`${p.first} ${p.surname}`).split(/\s+/);
      let score = 0;
      for (const t of toks) {
        const s = words.some(w => w === t) ? 3 : words.some(w => w.startsWith(t)) ? 2 : words.some(w => w.includes(t) || close(w, t)) ? 1 : 0;
        if (!s) return { p, score: 0 };
        score += s;
      }
      return { p, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(x => x.p);
}

function propose(p: Omit<Proposal, 'id' | 'state'>): Res {
  // one open proposal at a time — a new one replaces anything unconfirmed
  useProposals.setState(s => ({ list: [...s.list.map(x => (x.state === 'pending' ? { ...x, state: 'cancelled' as const } : x)), { ...p, id: `p${++seq}`, state: 'pending' as const }].slice(-6) }));
  const id = `p${seq}`;
  return {
    status: 'ok', proposal_id: id, summary: p.summary, missing_details: p.missing,
    message: 'Not saved yet. Read the summary back and ask the user to confirm.',
  };
}

export function confirmProposal(id: string): Res {
  const p = useProposals.getState().list.find(x => x.id === id);
  if (!p) return { status: 'not_found', retryable: false, message: `No proposal ${id}.` };
  if (p.state === 'saved') return { status: 'ok', message: 'Already saved.' };
  if (p.state === 'cancelled') return { status: 'invalid_argument', retryable: false, message: 'That proposal was replaced or cancelled. Make a new one.' };
  if (p.kind === 'remove' && !p.armed) {
    useProposals.setState(s => ({ list: s.list.map(x => (x.id === id ? { ...x, armed: true } : x)) }));
    return {
      status: 'needs_second_confirmation', retryable: true,
      message: 'Not removed yet. Removing someone needs a second yes. Ask: "Are you sure? This removes them and all their links." Call confirm_proposal again only after another clear yes.',
    };
  }
  const personId = p.apply();
  useProposals.setState(s => ({ list: s.list.map(x => (x.id === id ? { ...x, state: 'saved' as const } : x)) }));
  if (personId && people()[personId]) setTimeout(() => goTo(personId), 50);
  return { status: 'ok', message: 'Saved.', person_id: personId ?? null };
}
export function cancelProposal(id: string): Res {
  useProposals.setState(s => ({ list: s.list.map(x => (x.id === id && x.state === 'pending' ? { ...x, state: 'cancelled' as const } : x)) }));
  return { status: 'ok', message: 'Cancelled. Nothing was changed.' };
}

const REL_WORD: Record<string, [string, string, string]> = { child: ['daughter', 'son', 'child'], partner: ['wife', 'husband', 'partner'], parent: ['mother', 'father', 'parent'], sibling: ['sister', 'brother', 'sibling'] };
const relWord = (rel: string, s: Sex) => REL_WORD[rel][s === 'f' ? 0 : s === 'm' ? 1 : 2];

// ---------------- the tools ----------------
const handlers: Record<string, (a: Args) => Res> = {
  get_overview() {
    const ps = people(), fm = families(ps), me = useData.getState().me;
    return {
      status: 'ok',
      tree_name: useData.getState().tree?.name,
      total_people: Object.keys(ps).length,
      families: Object.entries(fm).map(([name, l]) => ({ family_name: name, people: l.length })),
      user: me && ps[me] ? brief(ps[me]) : null,
    };
  },

  find_people({ query }) {
    const q = str(query);
    if (!q) return { status: 'invalid_argument', retryable: false, message: 'Say a name to search for.' };
    const found = search(q);
    if (!found.length) return { status: 'no_results', retryable: false, message: `Nobody called "${q}" is in the tree yet.` };
    return { status: 'ok', matches: found.map(p => brief(p)) };
  },

  get_person({ person_id }) {
    const ps = people(), p = ps[str(person_id)];
    if (!p) return { status: 'not_found', retryable: false, message: 'No such person. Use find_people first.' };
    const list = (ids: string[]) => ids.filter(x => ps[x]).map(x => ({ id: x, name: fullName(ps[x]) }));
    return {
      status: 'ok', person: { ...brief(p), notes: p.notes || null, has_photo: !!p.photo },
      parents: list(p.parents), partners: list(p.spouses), children: list(kidsOf(ps, p.id)), siblings: list(sibsOf(ps, p.id)),
      is_user: useData.getState().me === p.id,
    };
  },

  how_related({ person_a_id, person_b_id }) {
    const ps = people(), a = str(person_a_id), b = str(person_b_id);
    if (!ps[a] || !ps[b]) return { status: 'not_found', retryable: false, message: 'Both people must be in the tree. Use find_people first.' };
    const path = pathBetween(ps, a, b);
    if (!path) return { status: 'no_results', retryable: false, message: `${nameOf(a)} and ${nameOf(b)} aren't connected in the tree yet.` };
    const te = teluguRelation(ps, a, b);
    const me = useData.getState().me;
    return {
      status: 'ok',
      english: relation(ps, a, b) || `connected through family (${path.length - 1} steps)`,
      telugu: te?.te ?? null, telugu_reading: te?.tr ?? null,
      meaning: `${nameOf(a)} is ${b === me ? 'your' : `${nameOf(b)}'s`} ${relation(ps, a, b) || 'relative'}`,
      chain: path.map(id => (id === me ? 'you' : nameOf(id))),
    };
  },

  propose_add_person(a) {
    const ps = people();
    const first = str(a.first_name);
    if (!first) return { status: 'invalid_argument', retryable: true, message: 'A first name is needed.' };
    const rel = (str(a.relation) || 'none') as 'none' | 'child' | 'partner' | 'parent' | 'sibling';
    const relative = a.relative_id ? ps[str(a.relative_id)] : undefined;
    if (rel !== 'none' && !relative) return { status: 'invalid_argument', retryable: true, message: 'Which existing person are they related to? Use find_people to get their id.' };
    if (rel === 'parent' && relative && relative.parents.filter(x => ps[x]).length >= 2)
      return { status: 'invalid_argument', retryable: false, message: `${fullName(relative)} already has two parents in the tree.` };
    const born = num(a.born_year), died = num(a.died_year);
    if (!okYear(born) || !okYear(died) || (born && died && died < born)) return { status: 'invalid_argument', retryable: true, message: 'Those years don’t look right — please check them.' };
    const sex = sexOf(a.gender) ?? '';
    let surname = str(a.family_name);
    if (!surname && relative && rel !== 'partner') surname = relative.surname;

    const missing: string[] = [];
    if (!surname) missing.push('family_name');
    if (!a.gender || a.gender === 'unknown') missing.push('gender');
    if (born === null) missing.push('born_year');

    let co: string | undefined;
    if (rel === 'child' && relative) {
      const partners = relative.spouses.filter(x => ps[x]);
      if (a.other_parent_id && ps[str(a.other_parent_id)]) co = str(a.other_parent_id);
      else if (partners.length === 1) co = partners[0];
      else if (partners.length > 1) missing.push(`other_parent (one of: ${partners.map(x => `${fullName(ps[x])} [${x}]`).join(', ')})`);
    }

    const dupes = Object.values(ps).filter(p => p.first.toLowerCase() === first.toLowerCase() && (!surname || p.surname.toLowerCase() === surname.toLowerCase()));
    const name = `${first}${surname ? ` ${surname}` : ''}`;
    const facts = [sex ? sexWord(sex) : '', born ? `born ${born}` : '', died ? `passed away ${died}` : ''].filter(Boolean).join(', ');
    const link = rel === 'none' || !relative ? '' :
      rel === 'child' ? ` as the ${relWord('child', sex)} of ${fullName(relative)}${co ? ` and ${nameOf(co)}` : ''}` :
        ` as the ${relWord(rel, sex)} of ${fullName(relative)}`;
    const res = propose({
      kind: 'add', icon: rel === 'none' ? 'seedling' : rel === 'partner' ? 'partner' : rel,
      summary: `Add ${name}${facts ? ` (${facts})` : ''}${link}.`,
      missing,
      apply: () => useData.getState().add(rel === 'none' ? 'new' : rel === 'partner' ? 'spouse' : rel, relative?.id,
        [{ first, surname, sex, born: born ? String(born) : '', died: died ? String(died) : '', notes: str(a.notes) }], co)[0],
    });
    if (dupes.length) res.warning = `There is already ${dupes.map(p => `${fullName(p)}${yr(p.born) ? ` (born ${yr(p.born)})` : ''}`).join(' and ')} in the tree — check this isn't the same person.`;
    if (relative) setTimeout(() => goTo(relative.id), 30);
    return res;
  },

  propose_update_person(a) {
    const ps = people(), p = ps[str(a.person_id)];
    if (!p) return { status: 'not_found', retryable: false, message: 'No such person. Use find_people first.' };
    const patch: Partial<Person> = {};
    const changes: string[] = [];
    if (str(a.first_name)) { patch.first = str(a.first_name); changes.push(`first name to ${patch.first}`); }
    if (str(a.family_name)) { patch.surname = str(a.family_name); changes.push(`family name to ${patch.surname}`); }
    const sx = sexOf(a.gender); if (sx !== undefined) { patch.sex = sx; changes.push(`gender to ${sexWord(sx)}`); }
    const born = num(a.born_year); if (born !== null) { if (!okYear(born)) return { status: 'invalid_argument', retryable: true, message: 'That birth year doesn’t look right.' }; patch.born = String(born); changes.push(`birth year to ${born}`); }
    if (a.died_year !== undefined) {
      const died = num(a.died_year);
      if (died === 0 || died === null) { patch.died = ''; changes.push('mark as living'); }
      else if (!okYear(died)) return { status: 'invalid_argument', retryable: true, message: 'That year doesn’t look right.' };
      else { patch.died = String(died); changes.push(`year of passing to ${died}`); }
    }
    if (str(a.notes)) { patch.notes = p.notes ? `${p.notes}\n${str(a.notes)}` : str(a.notes); changes.push('add a note'); }
    if (!changes.length) return { status: 'invalid_argument', retryable: true, message: 'Nothing to change — which detail should be updated?' };
    setTimeout(() => goTo(p.id), 30);
    return propose({ kind: 'update', icon: 'notes', missing: [], summary: `Update ${fullName(p)}: ${changes.join(', ')}.`, apply: () => { useData.getState().update(p.id, patch); return p.id; } });
  },

  propose_link(a) {
    const ps = people(), p = ps[str(a.person_id)], r = ps[str(a.relative_id)];
    const rel = str(a.relation) as 'child' | 'partner' | 'parent';
    if (!p || !r) return { status: 'not_found', retryable: false, message: 'Both people must already be in the tree.' };
    if (p.id === r.id || !['child', 'partner', 'parent'].includes(rel)) return { status: 'invalid_argument', retryable: false, message: 'That link doesn’t make sense.' };
    const child = rel === 'child' ? p : rel === 'parent' ? r : null, parent = rel === 'child' ? r : rel === 'parent' ? p : null;
    if (rel === 'partner' && p.spouses.includes(r.id)) return { status: 'ok', message: 'They are already partners in the tree.' };
    if (child && parent) {
      if (child.parents.includes(parent.id)) return { status: 'ok', message: 'That is already recorded.' };
      if (child.parents.filter(x => ps[x]).length >= 2) return { status: 'invalid_argument', retryable: false, message: `${fullName(child)} already has two parents.` };
      if (ancestorsOf(ps, parent.id).has(child.id)) return { status: 'invalid_argument', retryable: false, message: 'That would make someone their own ancestor.' };
    }
    setTimeout(() => goTo(p.id), 30);
    return propose({ kind: 'link', icon: 'link', missing: [], summary: `Record ${fullName(p)} as the ${relWord(rel, p.sex)} of ${fullName(r)}.`, apply: () => { useData.getState().link(p.id, rel, r.id); return p.id; } });
  },

  propose_remove_person(a) {
    const p = people()[str(a.person_id)];
    if (!p) return { status: 'not_found', retryable: false, message: 'No such person.' };
    setTimeout(() => goTo(p.id), 30);
    return propose({ kind: 'remove', icon: 'people', missing: [], summary: `Remove ${fullName(p)} and their links from the tree.`, apply: () => { useData.getState().remove(p.id); useUI.getState().set({ sel: null }); return undefined; } });
  },

  confirm_proposal: a => confirmProposal(str(a.proposal_id)),
  cancel_proposal: a => cancelProposal(str(a.proposal_id)),

  set_me(a) {
    const p = people()[str(a.person_id)];
    if (!p) return { status: 'not_found', retryable: false, message: 'No such person.' };
    useData.getState().setMe(p.id);
    return { status: 'ok', message: `Remembered: the user is ${fullName(p)}.` };
  },

  show_on_screen(a) {
    const ps = people();
    if (a.person_id && ps[str(a.person_id)]) { goTo(str(a.person_id)); return { status: 'ok' }; }
    const f = str(a.family_name);
    if (f) {
      const name = Object.keys(families(ps)).find(n => n.toLowerCase() === f.toLowerCase());
      if (name) { openFamilies([name]); return { status: 'ok' }; }
    }
    return { status: 'not_found', retryable: false, message: 'Couldn’t find that person or family to show.' };
  },
};

export function runTool(name: string, args: Args): Res {
  const h = handlers[name];
  if (!h) return { status: 'invalid_argument', retryable: false, message: `Unknown tool ${name}.` };
  try { return h(args || {}); }
  catch (e) { console.error('tool failed', name, e); return { status: 'error', retryable: false, message: 'Something went wrong doing that.' }; }
}

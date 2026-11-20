import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toast } from 'sonner';
import type { FormMode, FormState, People, Person, TreeData } from './types';
import { fam, sibsOf, uid, visibleIds } from './lib/family';
import { assignColors } from './lib/colors';
import { db, ok } from './lib/supabase';
import type { Lang } from './lib/i18n';

type Entry = Pick<Person, 'first' | 'surname' | 'sex' | 'born' | 'died' | 'notes'> & { photo?: string };
export interface TreeRef { id: string; key: string; name: string }

interface DataStore extends TreeData {
  // which tree this device has open (its key is the shared secret)
  tree: TreeRef | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  colors: Record<string, string>;
  me: string | null;
  lang: Lang;
  relTe: boolean;

  openTree: (ref: { id: string; key: string; name?: string }) => Promise<boolean>;
  createTree: (name: string) => Promise<void>;
  closeTree: () => void;
  reload: () => Promise<void>;

  setLang: (l: Lang) => void;
  setRelTe: (v: boolean) => void;
  setMe: (id: string | null) => void;
  add: (mode: FormMode, of: string | undefined, entries: Entry[], co?: string) => string[];
  update: (id: string, patch: Partial<Person>) => void;
  remove: (id: string) => TreeData;
  restore: (snap: TreeData) => void;
  toggleCollapsed: (id: string) => void;
  replace: (d: TreeData) => void;
  /** Connect two existing people: person is the child / partner / parent of relative. */
  link: (personId: string, relation: 'child' | 'partner' | 'parent', relativeId: string) => void;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Imported backups may use short ids — the database wants UUIDs. */
function remapIds(d: TreeData): TreeData {
  const map: Record<string, string> = {};
  for (const id of Object.keys(d.people || {})) map[id] = isUuid(id) ? id : uid();
  const people: People = {};
  for (const [id, p] of Object.entries(d.people || {})) {
    const nid = map[id];
    people[nid] = {
      id: nid, first: p.first || '', surname: p.surname || '', sex: p.sex || '', born: p.born || '', died: p.died || '',
      notes: p.notes || '', photo: p.photo, placeholder: p.placeholder,
      parents: (p.parents || []).map(x => map[x]).filter(Boolean),
      spouses: (p.spouses || []).map(x => map[x]).filter(Boolean),
    };
  }
  return { people, collapsed: {}, colors: d.colors || {}, me: d.me ? map[d.me] ?? null : null };
}

// ---------- server <-> local ----------
type Row = {
  id: string; tree_id: string; first_name: string; surname: string; sex: string; born: string; died: string;
  notes: string; photo: string | null; placeholder: boolean;
};
const toRow = (treeId: string, p: Person): Row => ({
  id: p.id, tree_id: treeId, first_name: p.first, surname: p.surname, sex: p.sex, born: p.born, died: p.died,
  notes: p.notes, photo: p.photo ?? null, placeholder: !!p.placeholder,
});
const relKeys = (people: People) => {
  const s = new Set<string>();
  for (const p of Object.values(people)) {
    p.parents.forEach(x => people[x] && s.add(`parent|${x}|${p.id}`));
    p.spouses.forEach(x => people[x] && s.add(`partner|${p.id < x ? p.id : x}|${p.id < x ? x : p.id}`));
  }
  return s;
};

let applyingRemote = false;
const remote = (patch: Partial<DataStore>) => { applyingRemote = true; useData.setState(patch); applyingRemote = false; };

let chain: Promise<unknown> = Promise.resolve();
let pending = 0;
function enqueue(job: () => Promise<unknown>) {
  pending++;
  chain = chain.then(job).catch(err => {
    console.error('save failed', err);
    toast.error(useData.getState().lang === 'te' ? 'ఆ మార్పు సేవ్ కాలేదు — తాజా వివరాలు మళ్ళీ లోడ్ చేశాం.' : 'Couldn’t save that change — reloaded the latest.');
    pending = 0;
    return useData.getState().reload();
  }).finally(() => { pending = Math.max(0, pending - 1); });
}

async function pushPeople(tree: TreeRef, prev: People, next: People) {
  const c = db(tree.key);
  const changed = Object.values(next).filter(p => !prev[p.id] || JSON.stringify(toRow(tree.id, prev[p.id])) !== JSON.stringify(toRow(tree.id, p)));
  const gone = Object.keys(prev).filter(id => !next[id]);
  const before = relKeys(prev), after = relKeys(next);
  const addRels = [...after].filter(k => !before.has(k));
  const dropRels = [...before].filter(k => !after.has(k) && !gone.some(g => k.includes(g)));

  if (changed.length) ok(await c.from('people').upsert(changed.map(p => toRow(tree.id, p))));
  await Promise.all(dropRels.map(async k => {
    const [kind, from_id, to_id] = k.split('|');
    ok(await c.from('relationships').delete().match({ tree_id: tree.id, kind, from_id, to_id }));
  }));
  if (addRels.length) ok(await c.from('relationships').upsert(
    addRels.map(k => { const [kind, from_id, to_id] = k.split('|'); return { tree_id: tree.id, kind, from_id, to_id }; }),
    { onConflict: 'tree_id,kind,from_id,to_id', ignoreDuplicates: true },
  ));
  if (gone.length) ok(await c.from('people').delete().in('id', gone));
}

export const useData = create<DataStore>()(
  persist(
    (setS, getS) => ({
      tree: null, status: 'idle', people: {}, collapsed: {}, colors: {}, me: null, lang: 'en', relTe: true,

      openTree: async ({ id, key, name }) => {
        const same = getS().tree?.id === id;
        remote({ tree: { id, key, name: name || getS().tree?.name || '' }, status: 'loading', ...(same ? {} : { people: {}, colors: {}, me: null, collapsed: {} }) });
        await getS().reload();
        return getS().status === 'ready';
      },

      createTree: async name => {
        const r = ok(await db('').rpc('create_tree', { p_name: name }));
        const row = (r.data as { id: string; access_key: string }[])[0];
        await getS().openTree({ id: row.id, key: row.access_key, name });
      },

      closeTree: () => remote({ tree: null, status: 'idle', people: {}, colors: {}, me: null, collapsed: {} }),

      reload: async () => {
        const tree = getS().tree;
        if (!tree) return;
        if (pending) { setTimeout(() => getS().reload(), 600); return; }
        try {
          const c = db(tree.key);
          const [t, p, r] = await Promise.all([
            c.from('trees').select('id,name,colors').eq('id', tree.id).maybeSingle(),
            c.from('people').select('*').eq('tree_id', tree.id).range(0, 9999),
            c.from('relationships').select('kind,from_id,to_id').eq('tree_id', tree.id).range(0, 19999),
          ]);
          ok(t); ok(p); ok(r);
          if (!t.data) { remote({ status: 'error', tree: null }); return; }
          const people: People = {};
          for (const row of p.data as Row[]) people[row.id] = {
            id: row.id, first: row.first_name, surname: row.surname, sex: row.sex as Person['sex'], born: row.born, died: row.died,
            notes: row.notes, photo: row.photo ?? undefined, placeholder: row.placeholder || undefined, parents: [], spouses: [],
          };
          for (const rel of r.data as { kind: string; from_id: string; to_id: string }[]) {
            const a = people[rel.from_id], b = people[rel.to_id];
            if (!a || !b) continue;
            if (rel.kind === 'parent') b.parents.push(a.id);
            else { a.spouses.push(b.id); b.spouses.push(a.id); }
          }
          const me = getS().me && people[getS().me!] ? getS().me : null;
          remote({ people, colors: (t.data.colors as Record<string, string>) || {}, status: 'ready', me, tree: { ...tree, name: t.data.name } });
        } catch (e) {
          console.error(e);
          remote({ status: 'error' });
        }
      },

      setLang: lang => setS({ lang }),
      setRelTe: relTe => setS({ relTe }),
      setMe: me => setS({ me }),

      add: (mode, of, entries, co) => {
        const people = clone(getS().people);
        const made: string[] = [];
        const wed = (a: string, b: string) => {
          if (!people[a].spouses.includes(b)) people[a].spouses.push(b);
          if (!people[b].spouses.includes(a)) people[b].spouses.push(a);
        };
        const o = of ? people[of] : undefined;
        if (mode === 'sibling' && o && !o.parents.length) {
          const ph = uid();
          people[ph] = { id: ph, first: 'Unknown', surname: o.surname, sex: '', born: '', died: '', notes: '', parents: [], spouses: [], placeholder: true };
          o.parents = [ph];
        }
        for (const e of entries) {
          const id = uid();
          people[id] = { id, ...e, parents: [], spouses: [] };
          if (!o) { made.push(id); continue; }
          if (mode === 'child') people[id].parents = [o.id, co].filter(Boolean) as string[];
          if (mode === 'spouse') wed(o.id, id);
          if (mode === 'sibling') people[id].parents = o.parents.slice();
          if (mode === 'parent') {
            const other = o.parents.find(p => people[p]);
            o.parents.push(id);
            if (other) wed(other, id);
            sibsOf(people, o.id).forEach(s => {
              const q = people[s];
              if (q.parents.length === 1 && q.parents[0] === other) q.parents.push(id);
            });
          }
          made.push(id);
        }
        setS({ people });
        return made;
      },

      update: (id, patch) => setS(s => {
        const p = { ...s.people[id], ...patch };
        if (patch.first !== undefined) delete p.placeholder;
        return { people: { ...s.people, [id]: p } };
      }),

      remove: id => {
        const snap: TreeData = clone({ people: getS().people, collapsed: getS().collapsed, me: getS().me });
        const people = clone(getS().people);
        Object.values(people).forEach(q => {
          q.parents = q.parents.filter(x => x !== id);
          q.spouses = q.spouses.filter(x => x !== id);
        });
        delete people[id];
        const collapsed = { ...getS().collapsed };
        delete collapsed[id];
        setS({ people, collapsed, me: getS().me === id ? null : getS().me });
        return snap;
      },

      restore: snap => setS({ people: snap.people, collapsed: snap.collapsed, me: snap.me ?? getS().me }),
      toggleCollapsed: id => setS(s => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
      link: (personId, relation, relativeId) => {
        const people = clone(getS().people);
        const p = people[personId], r = people[relativeId];
        if (!p || !r || p.id === r.id) return;
        if (relation === 'partner') {
          if (!p.spouses.includes(r.id)) p.spouses.push(r.id);
          if (!r.spouses.includes(p.id)) r.spouses.push(p.id);
        } else {
          const child = relation === 'child' ? p : r, parent = relation === 'child' ? r : p;
          if (!child.parents.includes(parent.id) && child.parents.length < 2) child.parents.push(parent.id);
        }
        setS({ people });
      },

      replace: d => {
        const r = remapIds(d);
        setS({ people: r.people, collapsed: {}, colors: r.colors || {}, me: r.me ?? null });
      },
    }),
    {
      name: 'family-tree-device',
      storage: createJSONStorage(() => localStorage),
      // only device preferences live here — the family itself lives in the database
      partialize: s => ({ tree: s.tree, collapsed: s.collapsed, me: s.me, lang: s.lang, relTe: s.relTe }),
    },
  ),
);

// save every local change to the database
useData.subscribe((s, prev) => {
  if (applyingRemote || !s.tree || s.status !== 'ready' || prev.status !== 'ready' || s.tree.id !== prev.tree?.id) return;
  const tree = s.tree;
  if (s.people !== prev.people) { const a = prev.people, b = s.people; enqueue(() => pushPeople(tree, a, b)); }
  if (s.colors !== prev.colors) { const colors = s.colors; enqueue(async () => ok(await db(tree.key).from('trees').update({ colors }).eq('id', tree.id))); }
});

// every family line gets a stable colour as soon as it exists
const syncColors = () => {
  const s = useData.getState();
  if (s.status !== 'ready') return;
  const next = assignColors(s.people, s.colors || {});
  if (next) useData.setState({ colors: next });
};
useData.subscribe((s, prev) => { if (s.people !== prev.people || s.colors !== prev.colors || s.status !== prev.status) syncColors(); });

/** Colour for a family's lines. */
export const useLineColor = () => {
  const colors = useData(s => s.colors);
  return (name: string) => colors[name] || 'var(--edge)';
};

/** Shareable link that opens this tree on another device. */
export function inviteLink() {
  const t = useData.getState().tree;
  if (!t) return '';
  const u = new URL(location.href);
  u.search = '';
  u.hash = `tree=${t.id}&key=${t.key}`;
  return u.toString();
}
export function parseInvite(text: string): { id: string; key: string } | null {
  const m = text.match(/tree=([0-9a-f-]{36}).*?key=([0-9a-f]{20,})/i);
  return m ? { id: m[1], key: m[2] } : null;
}

// ---------------- UI state (not saved) ----------------
interface UIStore {
  view: 'families' | 'tree';
  fams: string[];
  sel: string | null;
  hover: string | null;
  path: string[] | null;
  pathLabel: string;
  fitTick: number;
  shareTick: number;
  focus: { id: string; tick: number } | null;
  form: FormState | null;
  searchOpen: boolean;
  rel: { a?: string; b?: string } | null;
  set: (p: Partial<UIStore>) => void;
}
export const useUI = create<UIStore>()(setS => ({
  view: 'families', fams: [], sel: null, hover: null, path: null, pathLabel: '',
  fitTick: 0, shareTick: 0, focus: null, form: null, searchOpen: false, rel: null,
  set: p => setS(p),
}));

export function openFamilies(names: string[]) {
  const ui = useUI.getState();
  ui.set({ view: 'tree', fams: names, sel: null, path: null, fitTick: ui.fitTick + 1 });
}

/** Select someone, bringing their family into view if needed. */
export function goTo(id: string, center = true) {
  const { people, collapsed } = useData.getState();
  const ui = useUI.getState();
  const p = people[id];
  if (!p) return;
  let fams = ui.fams;
  const wasTree = ui.view === 'tree';
  if (!wasTree) fams = [fam(p)];
  else if (!visibleIds(people, new Set(fams), collapsed).includes(id)) fams = [...fams, fam(p)];
  ui.set({
    view: 'tree', fams, sel: id, path: null,
    fitTick: wasTree ? ui.fitTick : ui.fitTick + 1,
    focus: center ? { id, tick: Date.now() } : ui.focus,
  });
}

export const openForm = (f: FormState) => useUI.getState().set({ form: f });

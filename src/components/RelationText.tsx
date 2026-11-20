import { useData } from '../store';
import { relation, pathBetween } from '../lib/relations';
import { DISTANT, teluguRelation } from '../lib/telugu';
import { useT } from '../lib/i18n';

/** English + Telugu wording for "a is b's ___" (or "a is your ___" when b is you). */
export function useRelationWords(a?: string, b?: string) {
  const people = useData(s => s.people);
  if (!a || !b || !people[a] || !people[b]) return null;
  const en = relation(people, a, b);
  const path = pathBetween(people, a, b);
  const te = teluguRelation(people, a, b) ?? (path && path.length > 2 ? DISTANT : null);
  return { en, te, path };
}

/** The big sentence used in the person sheet and the relationship finder. */
export function RelationSentence({ a, b, youAreB }: { a: string; b: string; youAreB?: boolean }) {
  const t = useT();
  const people = useData(s => s.people);
  const lang = useData(s => s.lang);
  const relTe = useData(s => s.relTe);
  const w = useRelationWords(a, b);
  if (!w) return null;
  const A = people[a].first, B = people[b].first;

  if (!w.path) return <p className="font-serif text-[20px] leading-snug">{youAreB ? t('noConnYou', { n: A }) : t('noConn', { a: A, b: B })}</p>;

  const strong = (s: string) => <span className="font-semibold text-accent">{s}</span>;
  const sentence = (r: React.ReactNode) => {
    const tpl = youAreB ? t('isYour', { a: A, r: '\u0000' }) : t('isOf', { a: A, b: B, r: '\u0000' });
    const [x, y] = tpl.split('\u0000');
    return <p className="font-serif text-[21px] leading-snug">{x}{r}{y}</p>;
  };

  if (lang === 'te') {
    if (w.te) return (
      <div>
        {sentence(strong(w.te.te))}
        <p className="mt-1 text-[13px] text-muted">{w.te.tr}{w.en ? ` · ${w.en}` : ''}</p>
      </div>
    );
  }
  if (w.en) return (
    <div>
      {sentence(strong(w.en))}
      {relTe && w.te && (
        <p className="mt-2 inline-flex flex-wrap items-baseline gap-x-2 rounded-xl bg-card px-3 py-1.5 text-[14px]">
          <span className="text-muted">{t('inTelugu')}:</span>
          <span className="font-semibold">{w.te.te}</span>
          <span className="text-muted">({w.te.tr})</span>
        </p>
      )}
    </div>
  );
  return <p className="font-serif text-[20px] leading-snug">{youAreB ? t('stepsFromYou', { n: A, k: w.path.length - 1 }) : t('connectedSteps', { a: A, b: B, k: w.path.length - 1 })}</p>;
}

/** Short label for the highlighted-path pill. */
export function relationLabel(people: ReturnType<typeof useData.getState>['people'], a: string, b: string, you: boolean) {
  const s = useData.getState();
  const en = relation(people, a, b);
  const te = teluguRelation(people, a, b);
  const A = people[a].first, B = people[b].first;
  if (s.lang === 'te' && te) return you ? `${A} మీకు ${te.te}` : `${A}, ${B}కి ${te.te}`;
  const base = en ? (you ? `${A} is your ${en}` : `${A} is ${B}’s ${en}`) : `${A} ↔ ${B}`;
  return s.relTe && te ? `${base} · ${te.te}` : base;
}

import type { Sex, TreeData } from '../types';

export function sampleData(): TreeData {
  const d: TreeData = { people: {}, collapsed: {} };
  const add = (id: string, first: string, surname: string, sex: Sex, born: number, died?: number) =>
    (d.people[id] = { id, first, surname, sex, born: String(born), died: died ? String(died) : '', notes: '', parents: [], spouses: [] });
  const wed = (a: string, b: string) => { d.people[a].spouses.push(b); d.people[b].spouses.push(a); };
  const kids = (ps: string[], ...cs: string[]) => cs.forEach(c => (d.people[c].parents = ps.slice()));

  add('i1', 'Raman', 'Iyer', 'm', 1908, 1990); add('i2', 'Janaki', 'Iyer', 'f', 1912, 1999); wed('i1', 'i2');
  add('i3', 'Shankar', 'Iyer', 'm', 1935, 2015); add('i4', 'Usha', 'Iyer', 'f', 1938); kids(['i1', 'i2'], 'i3', 'i4');
  add('i5', 'Geeta', 'Iyer', 'f', 1940); wed('i3', 'i5');
  add('i6', 'Lata', 'Iyer', 'f', 1961); kids(['i3', 'i5'], 'i6');
  add('m1', 'Dinesh', 'Mehta', 'm', 1905, 1980); add('j1', 'Sarla', 'Joshi', 'f', 1910, 1994); wed('m1', 'j1');
  add('m2', 'Mohan', 'Mehta', 'm', 1934, 2012); add('m3', 'Kamala', 'Mehta', 'f', 1936); kids(['m1', 'j1'], 'm2', 'm3');
  wed('m2', 'i4');
  add('m4', 'Arjun', 'Mehta', 'm', 1960); add('m7', 'Nisha', 'Mehta', 'f', 1964); kids(['m2', 'i4'], 'm4', 'm7');
  add('r1', 'Venkat', 'Rao', 'm', 1932, 2008); wed('r1', 'm3');
  add('r2', 'Suresh', 'Rao', 'm', 1958); add('r3', 'Padma', 'Rao', 'f', 1962); kids(['r1', 'm3'], 'r2', 'r3');
  wed('r2', 'i6');
  add('j2', 'Vikram', 'Joshi', 'm', 1959); wed('r3', 'j2');
  add('j3', 'Riya', 'Joshi', 'f', 1988); add('j4', 'Dev', 'Joshi', 'm', 1992); kids(['j2', 'r3'], 'j3', 'j4');
  add('r4', 'Anil', 'Rao', 'm', 1985); add('r5', 'Meera', 'Rao', 'f', 1990); kids(['r2', 'i6'], 'r4', 'r5');
  add('d1', 'Joseph', "D'Souza", 'm', 1955); add('d2', 'Anne', "D'Souza", 'f', 1958); wed('d1', 'd2');
  add('d3', 'Maria', "D'Souza", 'f', 1987); kids(['d1', 'd2'], 'd3'); wed('r4', 'd3');
  add('r6', 'Kiran', 'Rao', 'm', 2015); add('r7', 'Leela', 'Rao', 'f', 2019); kids(['r4', 'd3'], 'r6', 'r7');
  d.people.r1.notes = 'Loved cricket and filter coffee. Taught every grandchild to ride a bike.';
  return d;
}

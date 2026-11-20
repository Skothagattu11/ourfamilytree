export type Sex = 'f' | 'm' | '';

export interface Person {
  id: string;
  first: string;
  surname: string;
  sex: Sex;
  born: string;
  died: string;
  notes: string;
  /** Optional photo, stored on-device as a small JPEG data URL. */
  photo?: string;
  parents: string[];
  spouses: string[];
  /** Auto-created stand-in (e.g. an unknown parent so siblings can connect). */
  placeholder?: boolean;
}

export type People = Record<string, Person>;

export interface TreeData {
  people: People;
  collapsed: Record<string, boolean>;
  /** Line colour per family name. */
  colors?: Record<string, string>;
  /** The person who is "you" on this device. */
  me?: string | null;
}

export type FormMode = 'new' | 'edit' | 'child' | 'spouse' | 'parent' | 'sibling';

export interface FormState {
  mode: FormMode;
  of?: string;
  surname?: string;
  first?: boolean;
  name?: string;
}

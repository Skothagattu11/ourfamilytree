import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_KEY as string;

const clients = new Map<string, SupabaseClient>();

/**
 * A client that carries this tree's secret key on every request.
 * Row-level security only returns rows of the tree the key unlocks.
 */
export function db(treeKey = ''): SupabaseClient {
  let c = clients.get(treeKey);
  if (!c) {
    c = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `ft-${treeKey.slice(0, 8) || 'anon'}` },
      global: { headers: { 'x-tree-key': treeKey } },
    });
    clients.set(treeKey, c);
  }
  return c;
}

/** Supabase returns errors instead of throwing — make them throw. */
export function ok<T extends { error: unknown }>(r: T): T {
  if (r.error) throw r.error;
  return r;
}

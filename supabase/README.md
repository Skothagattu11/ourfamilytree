# Database (Supabase project "family-tree", ref abcmxkmdxljynqayadic)

Applied migrations (via the Supabase MCP):
- `family_tree_core` — trees / people / relationships, RLS keyed on the `x-tree-key` header, `create_tree()` RPC
- `relationships_fk_indexes` — composite indexes matching the relationship foreign keys

No login yet: each tree has a secret `access_key`; the app sends it as the `x-tree-key` header and RLS
only exposes that tree's rows. Invite links carry the key in the URL hash (`#tree=<id>&key=<key>`),
so anyone with the link can view and edit. When login is added, replace the "with key" policies with
membership-based ones.

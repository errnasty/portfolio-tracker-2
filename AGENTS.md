## Keeping users informed (REQUIRED after adding features)

Every user-facing feature you add or change must reach users through the in-app
update surfaces. Before committing:

1. **Changelog** — add an entry at the TOP of `src/lib/changelog.ts` (new version
   string, newest first, deep-link `href` per item). The What's New dialog pops
   once per version for every user; this is the only way they hear about updates.
2. **Onboarding tour** — if the feature adds a page or changes setup, update the
   steps in `src/components/layout/OnboardingTour.tsx` so new users see it on
   the walkthrough.
3. **Guide** — update the steps/extras in `src/app/(dashboard)/guide/page.tsx`
   if setup instructions changed.
4. **Navigation** — register the route in `src/lib/nav-registry.ts`. If a sidebar
   group is getting crowded, mark related routes `hidden: true` and link them as
   `SubNav` tabs from a parent page instead (see SUB_NAVS there).
5. New tables/columns go in BOTH `supabase-schema.sql` (idempotent, canonical)
   and a new numbered file in `supabase/migrations/`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

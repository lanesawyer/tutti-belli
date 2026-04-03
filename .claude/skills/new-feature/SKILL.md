---
name: new-feature
description: Scaffolds a full-stack feature for tutti-belli — lib functions, actions, and an optional page — following the project's established patterns
user-invocable: true
---

You are scaffolding a new feature in the tutti-belli Astro 6 SSR app. Follow these steps exactly.

## Step 1 — Clarify the feature

If `$ARGUMENTS` is provided, treat it as the feature name/description and proceed.
Otherwise, ask the user: "What feature are you building? Give a short name (e.g. `announcements`, `song-requests`) and describe what it does."

From the feature name, derive:
- **`<name>`** — a lowercase, hyphen-separated identifier (e.g. `song-requests`)
- **`<camelName>`** — camelCase version (e.g. `songRequests`)
- **`<PascalName>`** — PascalCase version (e.g. `SongRequests`)

## Step 2 — Ask what to scaffold

Ask the user which pieces they want created:
1. `src/lib/<name>.ts` — DB query / business logic functions
2. `src/actions/<name>.ts` — Astro Actions (form handlers)
3. A page stub (ask for the path, e.g. `src/pages/ensembles/[id]/<name>.astro`)

Default is all three. Let them opt out of any piece.

Also ask: **What permission level does this feature require?**
- `member` — any active ensemble member
- `admin` — ensemble admin only
- `site-admin` — site-wide admin (`user.role === 'admin'`)

## Step 3 — Scaffold `src/lib/<name>.ts`

Create the file. Use this structure as a template:

```ts
import { db, eq, <TableNames> } from 'astro:db';

// TODO: add query functions for <name>

export async function get<PascalName>s(ensembleId: string) {
  return await db
    .select()
    .from(<Table>)
    .where(eq(<Table>.ensembleId, ensembleId))
    .all();
}

export async function create<PascalName>(/* params */) {
  await db.insert(<Table>).values({
    id: crypto.randomUUID(),
    // fields...
  });
}
```

Rules:
- Import only from `astro:db` — never import `astro:db` in page frontmatter
- Use `crypto.randomUUID()` for all primary keys
- Export all functions individually (no default export)
- Use `eq`, `and`, `or`, `desc`, `asc` from `astro:db` for query operators

## Step 4 — Scaffold `src/actions/<name>.ts`

Create the file. Use this structure as a template:

```ts
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin } from './utils';  // only if admin-gated
import { create<PascalName>, update<PascalName>, delete<PascalName> } from '@lib/<name>';

export const <camelName> = {
  create: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      // feature-specific fields...
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      // permission check:
      await assertEnsembleAdmin(input.ensembleId, user);  // if admin
      // or: await assertEnsembleMember(input.ensembleId, user);  // if member
      await create<PascalName>(/* args */);
    },
  }),

  // add update/delete actions as appropriate
};
```

Rules:
- Always check `context.locals.user` first and throw `UNAUTHORIZED` if missing
- Use `assertEnsembleAdmin` from `./utils` for ensemble admin checks
- Use `ActionError` (from `astro:actions`) for all error cases — never return error objects
- Keep handlers thin — delegate all logic to `@lib/<name>` functions
- Use `accept: 'form'` for all actions (HTML form POSTs)

Then **add the export to `src/actions/index.ts`**:
- Import: `import { <camelName> } from './<name>';`
- Add `<camelName>` to the `server` export object

## Step 5 — Scaffold the page (if requested)

Create the `.astro` file at the requested path. Use this structure:

```astro
---
import { actions } from 'astro:actions';
import { getEnsembleById } from '@lib/ensemble';  // adjust as needed
import Layout from '@layouts/BaseLayout.astro';   // or SingleColumnLayout for simple pages
// import any needed lib functions from @lib/<name>

const { id } = Astro.params;
const user = Astro.locals.user;
if (!user) return Astro.redirect('/login');

const ensemble = await getEnsembleById(id!);
if (!ensemble) return Astro.redirect('/');

// Permission check (adjust for feature's permission level):
// const member = await getEnsembleMember(ensemble.id, user.id);
// if (!member) return Astro.redirect('/');

// Read action results
const createResult = Astro.getActionResult(actions.<camelName>.create);
if (createResult && !createResult.error) {
  return Astro.redirect(Astro.url.pathname);
}

// Fetch data
// const items = await get<PascalName>s(ensemble.id);
---

<Layout title="<PascalName>">
  <section class="section">
    <div class="container">
      <!-- TODO: page content -->
    </div>
  </section>
</Layout>
```

Rules:
- **Never import `astro:db` in page frontmatter** — all DB access goes through `@lib/*` functions
- Use `@layouts/BaseLayout.astro` for ensemble sub-pages, `@layouts/SingleColumnLayout.astro` for narrow forms
- Use `@components/*` imports — never raw HTML equivalents. Key components:
  - `Box.astro` instead of `<div class="box">`
  - `Button.astro` instead of `<button>` or `<a class="button">`
  - `Icon.astro` instead of `<i class="fas ...">`
  - `TextInput.astro` instead of `<input class="input">`
  - `Select.astro` instead of `<div class="select"><select>`
  - `Table.astro`, `Modal.astro`, `Notification.astro`, `Tag.astro` as needed
- Redirect after successful action (`return Astro.redirect(...)`) to prevent double-submit
- All client-side `<script>` DOM manipulation must be inside `document.addEventListener('astro:page-load', () => { ... })`

## Step 6 — Write and run tests

Invoke the `/test-feature <name>` skill to write integration and e2e tests for the scaffolded feature and run them.

## Step 7 — Summary

After all files are created and tests pass, output:
- A bullet list of files created/modified
- Any TODO items left for the user to fill in (field names, table names, etc.)
- A reminder to run `pnpm check` to catch TypeScript errors

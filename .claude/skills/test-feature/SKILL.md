---
name: test-feature
description: Writes and runs tests for a tutti-belli feature — integration tests for lib functions and an e2e test for the happy-path form flow
user-invocable: true
---

You are writing tests for a feature in the tutti-belli Astro 5 SSR app. Follow these steps exactly.

## Step 1 — Identify what to test

If `$ARGUMENTS` is provided, treat it as the feature name (e.g. `groups`, `song-requests`).
Otherwise, ask the user: "Which feature are you testing? Give the name (e.g. `groups`) and optionally describe the key actions (create/update/delete)."

From the feature name, derive:
- **`<name>`** — lowercase, hyphen-separated (e.g. `song-requests`)
- **`<camelName>`** — camelCase (e.g. `songRequests`)

Identify the relevant files:
- `src/lib/<name>.ts` — lib functions to integration-test
- `src/actions/<name>.ts` — actions (tested indirectly via lib + e2e)
- Any page at `src/pages/ensembles/[id]/<name>.astro` or similar

Read these files before writing any tests.

## Step 2 — Write integration tests

Create `tests/integration/<name>.test.ts`. Test each exported lib function that touches the DB.

**Structure:**
```ts
import { describe, it, expect } from 'vitest';
import { db, eq, <TableNames> } from 'astro:db';
import { createUser, createEnsemble, /* other fixtures */ } from './fixtures.ts';
import { myLibFunction, anotherLibFunction } from '../../src/lib/<name>.ts';

describe('<name> lib', () => {
  describe('myLibFunction', () => {
    it('does the happy path', async () => {
      const user = await createUser();
      const ensemble = await createEnsemble(user!.id);
      // ... set up, call function, assert
    });

    it('handles edge case', async () => {
      // ...
    });
  });
});
```

**Rules:**
- Import fixtures from `./fixtures.ts` — use `createUser`, `createEnsemble`, `createMembership`, `createGroup`, `createSeason`, `createEvent`, etc. as needed
- Import the lib functions directly from `../../src/lib/<name>.ts`
- If the lib file imports `storage.ts`, mock it at the top: `vi.mock('../../src/lib/storage.ts')`
- Test the happy path for each function, plus key edge cases (not found, duplicate, permission boundaries)
- Do NOT mock the DB — integration tests hit the real LibSQL test DB
- Use `expect(...).toBeNull()`, `expect(...).toBe(...)`, `expect(...).toHaveLength(...)` etc.
- Each `it` block should be independent — create fresh fixtures, don't share state

**What to cover:**
- Create functions: assert the record exists after insertion with correct field values
- Update functions: assert the changed fields, assert unchanged fields stay the same
- Delete functions: assert the record is gone, assert related records are cleaned up (cascades)
- Query/get functions: assert correct filtering, ordering, and shape of returned data

## Step 3 — Write e2e tests

Create `tests/e2e/<name>.spec.ts`. Cover the primary user flow and any permission boundaries.

**Structure:**
```ts
/**
 * E2E tests for <name> flows.
 * Uses the admin user's auth state (chromium-admin project).
 */
import { test, expect } from '@playwright/test';

async function navigateTo<PascalName>(page: ReturnType<typeof test['info']>['project']['use'] & any) {
  await page.goto('/ensembles');
  await page.locator('.card').filter({ hasText: 'Chamber Orchestra' }).locator('a').first().click();
  await expect(page).toHaveURL(/\/ensembles\/.+/);
  const ensembleUrl = page.url();
  await page.goto(ensembleUrl + '/<name>');
  await expect(page).toHaveURL(/<name>/);
}

test('<name> page loads without error', async ({ page }) => {
  await navigateTo<PascalName>(page);
  await expect(page.locator('body')).not.toContainText('500');
});

test('admin can create a <name>', async ({ page }) => {
  await navigateTo<PascalName>(page);
  // fill form, submit, assert result
});
```

**Rules:**
- Always use the `chromium-admin` auth project (set via `playwright.config.ts` — no extra setup needed)
- Navigate to ensemble sub-pages by constructing the URL from `page.url()`, NOT by clicking navbar dropdown links (they require hover)
- Submit buttons associated with a form via `form="formId"` must be located with `page.locator('button[type="submit"][form="formId"]')`
- Any test that registers a new user must use a unique email:
  ```ts
  function uniqueEmail(label: string, workerIndex: number) {
    return `e2e-${label}-${workerIndex}-${Date.now()}@example.com`;
  }
  // use: async ({ page }, workerInfo) => { ... uniqueEmail('label', workerInfo.workerIndex) }
  ```
- Use `await expect(page.locator('.notification')).toBeVisible()` before `page.goto()` in Firefox-sensitive flows to avoid `NS_BINDING_ABORTED`
- Use the `ReturnType<typeof test['info']>['project']['use'] & any` type for page helper function parameters

**What to cover:**
- Page loads without a 500 error
- Admin can perform the primary create action and see the result
- Admin can perform the primary delete/update action (if applicable)
- Non-admin is redirected or sees an error (if the feature is admin-gated)

## Step 4 — Run the tests

Run integration tests:
```
pnpm test tests/integration/<name>.test.ts
```

Run e2e tests (requires dev server running on port 4321):
```
pnpm test:e2e --grep "<name>"
```

If tests fail:
- Read the error carefully before changing anything
- Fix the test if the assertion is wrong, fix the lib if the logic is wrong
- Re-run after each fix

## Step 5 — Summary

Report:
- Files created
- Number of tests written (integration + e2e)
- Pass/fail status
- Any TODOs left for the user (e.g. fixtures that don't exist yet in `fixtures.ts`)

// Stands in for the `astro:actions` virtual module under Vitest. The real module pulls in
// `virtual:astro:actions/options`, which only exists inside an Astro build; these are the same
// runtime implementations it re-exports, so zod parsing and ActionError behave as in production.
import { defineAction as astroDefineAction } from '../../node_modules/astro/dist/actions/runtime/server.js';

export { getActionContext, ACTION_API_CONTEXT_SYMBOL } from '../../node_modules/astro/dist/actions/runtime/server.js';
export { ActionError, ActionInputError, isActionError, isInputError } from '../../node_modules/astro/dist/actions/runtime/client.js';

export const INPUT_SCHEMA = Symbol('inputSchema');

// Astro keeps the schema private to the handler; tests read it to see which ID fields an action takes.
export const defineAction: typeof astroDefineAction = (config) =>
  Object.assign(astroDefineAction(config), { [INPUT_SCHEMA]: config.input });

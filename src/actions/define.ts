import { ActionError, defineAction as astroDefineAction } from "astro:actions";

type Handler = (input: unknown, context: { request: Request; url: URL }) => unknown;

// Astro turns any other error thrown by a handler into a 500 ActionError without logging it.
export const defineAction: typeof astroDefineAction = (config) => {
  const handler = config.handler as Handler;
  const loggedHandler: Handler = async (input, context) => {
    try {
      return await handler(input, context);
    } catch (error) {
      if (!(error instanceof ActionError)) {
        console.error(`${context.request.method} ${context.url.pathname} failed:`, error);
      }
      throw error;
    }
  };
  return astroDefineAction({
    ...config,
    handler: loggedHandler as unknown as typeof config.handler,
  });
};

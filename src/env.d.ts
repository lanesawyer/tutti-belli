// oxlint-disable-next-line typescript/triple-slash-reference -- Astro's generated types are only reachable this way
/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    session: import("./lib/session").Session | null;
    user: import("./lib/session").SessionUser | null;
    /** Set while a site admin views the site as another user; `user` is then that user. */
    viewingAs: { realUser: NonNullable<Locals["user"]> } | null;
  }
}

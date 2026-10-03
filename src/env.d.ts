// oxlint-disable-next-line typescript/triple-slash-reference -- Astro's generated types are only reachable this way
/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    session: import('./lib/session').Session | null;
    user: {
      id: string;
      email: string;
      name: string;
      avatarUrl: string | null;
      phone: string | null;
      role: string;
      createdAt: Date;
    } | null;
    /** Set while a site admin previews the site as a test account; `user` is then that account. */
    viewingAs: { realUser: NonNullable<Locals['user']> } | null;
  }
}

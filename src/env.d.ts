/// <reference path="../.astro/types.d.ts" />

// @astrojs/db/dist/runtime/virtual.js is in the package's exports map but ships no .d.ts
declare module '@astrojs/db/dist/runtime/virtual.js';

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
  }
}

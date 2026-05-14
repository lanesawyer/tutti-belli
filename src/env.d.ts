/// <reference path="../.astro/types.d.ts" />

// @astrojs/db/dist/runtime/virtual.js is in the package's exports map but ships no .d.ts
declare module '@astrojs/db/dist/runtime/virtual.js';

declare namespace App {
  interface Locals {
    session: import('./lib/auth').Session | null;
    user: {
      id: string;
      email: string;
      name: string;
      image: string | null;
      emailVerified: boolean;
      role: string;
      avatarUrl: string | null;
      phone: string | null;
      createdAt: Date;
      updatedAt: Date;
    } | null;
  }
}

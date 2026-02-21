/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    session: import('./lib/session').Session | null;
    user: {
      id: string;
      email: string;
      name: string;
      avatarUrl: string | null;
      role: string;
      createdAt: Date;
    } | null;
  }
}

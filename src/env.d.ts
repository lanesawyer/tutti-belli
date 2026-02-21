/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    session: import('./lib/session').Session | null;
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      createdAt: Date;
    } | null;
  }
}

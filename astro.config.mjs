// @ts-check
import { defineConfig } from 'astro/config';
import db from '@astrojs/db';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://tutti.lanesawyer.dev',
  integrations: [db()],
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  security: {
    checkOrigin: false
  }
});

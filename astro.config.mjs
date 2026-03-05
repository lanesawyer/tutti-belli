// @ts-check
import { defineConfig } from 'astro/config';
import db from '@astrojs/db';
import node from '@astrojs/node';
import path from 'path';

// https://astro.build/config
export default defineConfig({
  site: 'https://tuttibelli.org',
  integrations: [db()],
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  security: {
    checkOrigin: false
  },
  vite: {
    resolve: {
      alias: {
        '@actions': path.resolve('./src/actions'),
        '@components': path.resolve('./src/components'),
        '@containers': path.resolve('./src/containers'),
        '@layouts': path.resolve('./src/layouts'),
        '@lib': path.resolve('./src/lib'),
      }
    }
  }
});

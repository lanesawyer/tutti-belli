// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import path from 'path';

// https://astro.build/config
export default defineConfig({
  site: 'https://tuttibelli.org',
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
        '@db': path.resolve('./db/index.ts'),
        '@actions': path.resolve('./src/actions'),
        '@components': path.resolve('./src/components'),
        '@containers': path.resolve('./src/containers'),
        '@layouts': path.resolve('./src/layouts'),
        '@lib': path.resolve('./src/lib'),
      }
    }
  }
});

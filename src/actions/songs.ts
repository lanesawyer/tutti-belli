import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin } from './utils';
import { addSong, editSong, deleteSong, addSongFile, deleteSongFile } from '../lib/songs';

export const songs = {
  add: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      name: z.string().min(1, 'Song name is required.'),
      composer: z.string().optional(),
      arranger: z.string().optional(),
      runTimeMinutes: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).default(0)),
      runTimeSeconds: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).max(59).default(0)),
      parts: z.preprocess((v) => (v == null ? undefined : v), z.union([z.string(), z.array(z.string())]).optional()).transform((v) =>
        v === undefined ? [] : Array.isArray(v) ? v : [v]
      ),
      seasons: z.preprocess((v) => (v == null ? undefined : v), z.union([z.string(), z.array(z.string())]).optional()).transform((v) =>
        v === undefined ? [] : Array.isArray(v) ? v : [v]
      ),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);

      await addSong(input.ensembleId, input);
    },
  }),

  edit: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      songId: z.string(),
      name: z.string().min(1, 'Song name is required.'),
      composer: z.string().optional(),
      arranger: z.string().optional(),
      runTimeMinutes: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).default(0)),
      runTimeSeconds: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).max(59).default(0)),
      parts: z.preprocess((v) => (v == null ? undefined : v), z.union([z.string(), z.array(z.string())]).optional()).transform((v) =>
        v === undefined ? [] : Array.isArray(v) ? v : [v]
      ),
      seasons: z.preprocess((v) => (v == null ? undefined : v), z.union([z.string(), z.array(z.string())]).optional()).transform((v) =>
        v === undefined ? [] : Array.isArray(v) ? v : [v]
      ),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);

      await editSong(input);
    },
  }),

  delete: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      songId: z.string(),
    }),
    handler: async ({ ensembleId, songId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);

      await deleteSong(songId);
    },
  }),

  addFile: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      songId: z.string(),
      fileName: z.string().min(1, 'Display name is required.'),
      category: z.enum(['sheet_music', 'rehearsal_track', 'other', 'link']).default('other'),
      fileUrl: z.string().optional(),
      file: z.instanceof(File).optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);

      const result = await addSongFile(input, user.id, input.ensembleId);
      if (result.error) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      }
    },
  }),

  deleteFile: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      fileId: z.string(),
    }),
    handler: async ({ ensembleId, fileId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);

      await deleteSongFile(fileId);
    },
  }),
};

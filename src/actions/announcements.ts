import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin, assertInEnsemble } from './utils';
import { createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@lib/announcements';

export const announcements = {
  create: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      title: z.string().min(1, 'Title is required.'),
      content: z.string().min(1, 'Content is required.'),
      postToDiscord: z.enum(['on']).optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await createAnnouncement({
        ensembleId: input.ensembleId,
        title: input.title.trim(),
        content: input.content.trim(),
        createdBy: user.id,
        creatorName: user.name,
        postToDiscord: input.postToDiscord === 'on',
      });
    },
  }),

  update: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      announcementId: z.string(),
      title: z.string().min(1, 'Title is required.'),
      content: z.string().min(1, 'Content is required.'),
      postToDiscord: z.enum(['on']).optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await assertInEnsemble('announcement', input.announcementId, input.ensembleId);
      await updateAnnouncement({
        announcementId: input.announcementId,
        ensembleId: input.ensembleId,
        title: input.title.trim(),
        content: input.content.trim(),
        creatorName: user.name,
        postToDiscord: input.postToDiscord === 'on',
      });
    },
  }),

  delete: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      announcementId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await assertInEnsemble('announcement', input.announcementId, input.ensembleId);
      await deleteAnnouncement(input.announcementId);
    },
  }),
};

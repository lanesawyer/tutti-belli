import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { db, eq, EnsembleInvite } from 'astro:db';
import { assertEnsembleAdmin } from './utils';
import {
  joinEnsembleWithCode,
  getEnsembleLinks,
  isSlugTaken,
  updateEnsemble,
  addEnsembleLink,
  deleteEnsembleLink,
} from '@lib/ensemble';
import { validateImageFile, fileToDataUri } from '@lib/upload';
import { generateSlug } from '@lib/slug';

export const ensembles = {
  join: defineAction({
    accept: 'form',
    input: z.object({
      code: z.string().min(1),
      agreedToCodeOfConduct: z.enum(['on']).optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const result = await joinEnsembleWithCode(
        user.id,
        input.code.trim(),
        input.agreedToCodeOfConduct === 'on',
      );
      if (!result.ok) throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      return { ensembleId: result.ensembleId };
    },
  }),

  createInvite: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      await db.insert(EnsembleInvite).values({
        id: crypto.randomUUID(),
        ensembleId: input.ensembleId,
        code,
        createdBy: user.id,
      });
    },
  }),

  deleteInvite: defineAction({
    accept: 'form',
    input: z.object({
      inviteId: z.string(),
      ensembleId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await db.delete(EnsembleInvite).where(eq(EnsembleInvite.id, input.inviteId));
    },
  }),

  update: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      currentImageUrl: z.string().optional(),
      name: z.string().min(1, 'Ensemble name is required.'),
      slug: z.string().optional(),
      description: z.string().optional(),
      discordLink: z.string().optional(),
      discordWebhookUrl: z.string().optional(),
      codeOfConduct: z.string().optional(),
      removeImage: z.string().optional(),
      image: z.instanceof(File).optional(),
      checkInStartMinutes: z.coerce.number().int().min(0).default(30),
      checkInEndMinutes: z.coerce.number().int().min(0).default(15),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);

      // Handle slug
      let newSlug: string | null = null;
      const rawSlug = input.slug?.trim() ?? '';
      if (rawSlug !== '') {
        const normalized = generateSlug(rawSlug);
        if (!normalized) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Invalid slug — use only letters, numbers, and hyphens.',
          });
        }
        if (await isSlugTaken(normalized, input.ensembleId)) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `The slug "${normalized}" is already taken by another ensemble.`,
          });
        }
        newSlug = normalized;
      }

      // Handle image
      let imageUrl: string | null | undefined = input.currentImageUrl ?? null;
      if (input.removeImage === 'true') {
        imageUrl = null;
      }
      if (input.image && input.image.size > 0) {
        const validation = validateImageFile(input.image, 5);
        if (!validation.valid) {
          throw new ActionError({ code: 'BAD_REQUEST', message: validation.error! });
        }
        imageUrl = await fileToDataUri(input.image);
      }

      await updateEnsemble(input.ensembleId, {
        name: input.name.trim(),
        slug: newSlug,
        description: input.description?.trim() || null,
        discordLink: input.discordLink?.trim() || null,
        discordWebhookUrl: input.discordWebhookUrl?.trim() || null,
        codeOfConduct: input.codeOfConduct?.trim() || null,
        imageUrl,
        checkInStartMinutes: input.checkInStartMinutes,
        checkInEndMinutes: input.checkInEndMinutes,
      });

      return { newSlug };
    },
  }),

  addLink: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      label: z.string().min(1, 'Label is required.'),
      url: z.string().url('Please enter a valid URL.'),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      const links = await getEnsembleLinks(input.ensembleId);
      await addEnsembleLink(input.ensembleId, input.label.trim(), input.url.trim(), links.length);
    },
  }),

  deleteLink: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      linkId: z.string(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      await deleteEnsembleLink(input.linkId, input.ensembleId);
    },
  }),
};

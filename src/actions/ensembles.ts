import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin, assertInEnsemble } from './utils';
import {
  joinEnsembleWithCode,
  getEnsembleLinks,
  isSlugTaken,
  updateEnsemble,
  addEnsembleLink,
  deleteEnsembleLink,
  createInvite,
  deleteInvite,
} from '@lib/ensemble';
import { validateImageFile, fileToDataUri } from '@lib/upload';
import { generateSlug } from '@lib/slug';
import { randomCode } from '@lib/codes';
import { isDiscordWebhookUrl } from '@lib/discord';

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
      const code = randomCode();
      await createInvite(input.ensembleId, code, user.id);
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
      await assertInEnsemble('invite', input.inviteId, input.ensembleId);
      await deleteInvite(input.inviteId, input.ensembleId);
    },
  }),

  update: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      name: z.string().min(1, 'Ensemble name is required.'),
      slug: z.string().optional(),
      description: z.string().optional(),
      discordLink: z.string().optional(),
      discordWebhookUrl: z
        .string()
        .trim()
        .refine((value) => value === '' || isDiscordWebhookUrl(value), 'Enter a Discord webhook URL (https://discord.com/api/webhooks/...).')
        .optional(),
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

      // Handle image. Undefined leaves the stored image as it is.
      let imageUrl: string | null | undefined;
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
      await assertInEnsemble('link', input.linkId, input.ensembleId);
      await deleteEnsembleLink(input.linkId, input.ensembleId);
    },
  }),
};

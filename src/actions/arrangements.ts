import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin, assertEnsembleMember } from './utils';
import { db, eq, and, EnsembleMember } from 'astro:db';

import {
  createArrangement,
  updateArrangementStatus,
  addArrangementReviewer,
  addArrangementMessage,
  addArrangementRevision,
  getArrangement,
} from '@lib/arrangements';

export const arrangements = {
  submit: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      name: z.string().min(1, 'Title is required.'),
      composer: z.string().optional(),
      arranger: z.string().optional(),
      description: z.string().optional(),
      file: z.instanceof(File),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleMember(input.ensembleId, user);

      if (!input.file || input.file.size === 0) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'A PDF file is required.' });
      }

      const result = await createArrangement(
        {
          ensembleId: input.ensembleId,
          submittedBy: user.id,
          name: input.name,
          composer: input.composer,
          arranger: input.arranger,
          description: input.description,
        },
        input.file,
      );

      if (result.error) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      }

      return { arrangementId: result.id };
    },
  }),

  startReview: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      arrangementId: z.string(),
    }),
    handler: async ({ ensembleId, arrangementId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);

      await addArrangementReviewer(arrangementId, user.id);
      await updateArrangementStatus(arrangementId, 'in_review');
    },
  }),

  updateStatus: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      arrangementId: z.string(),
      status: z.enum(['in_review', 'needs_revision', 'approved', 'rejected']),
    }),
    handler: async ({ ensembleId, arrangementId, status }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);

      await updateArrangementStatus(arrangementId, status);
    },
  }),

  addMessage: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      arrangementId: z.string(),
      content: z.string().min(1, 'Message cannot be empty.'),
    }),
    handler: async ({ ensembleId, arrangementId, content }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });

      // Both the submitter and ensemble admins can message
      const arrangement = await getArrangement(arrangementId);
      if (!arrangement || arrangement.ensembleId !== ensembleId) {
        throw new ActionError({ code: 'NOT_FOUND' });
      }

      const membership = await db
        .select()
        .from(EnsembleMember)
        .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.userId, user.id)))
        .get();

      if (arrangement.submittedBy !== user.id && !membership) {
        throw new ActionError({ code: 'FORBIDDEN' });
      }

      await addArrangementMessage(arrangementId, user.id, content);
    },
  }),

  uploadRevision: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      arrangementId: z.string(),
      file: z.instanceof(File),
    }),
    handler: async ({ ensembleId, arrangementId, file }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });

      const arrangement = await getArrangement(arrangementId);
      if (!arrangement || arrangement.ensembleId !== ensembleId) {
        throw new ActionError({ code: 'NOT_FOUND' });
      }
      if (arrangement.submittedBy !== user.id) {
        throw new ActionError({ code: 'FORBIDDEN' });
      }

      if (!file || file.size === 0) {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'A PDF file is required.' });
      }

      const result = await addArrangementRevision(arrangementId, file, ensembleId, user.id);
      if (result.error) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      }
    },
  }),
};

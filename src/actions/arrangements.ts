import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { assertEnsembleAdmin } from './utils';
import { getActiveMembership } from '@lib/ensemble';
import { canManageEnsemble } from '@lib/permissions';
import {
  addArrangementComment,
  approveArrangement,
  declineArrangement,
  deleteArrangements,
  setArrangementReviewGroup,
  getArrangementById,
  getArrangementFileWithAccess,
  isArrangementReviewer,
} from '@lib/arrangements';

async function assertCanReview(ensembleId: string, user: { id: string; role: string }) {
  const membership = await getActiveMembership(ensembleId, user.id);
  if (canManageEnsemble(user, membership)) return;
  if (!(await isArrangementReviewer(ensembleId, user.id))) {
    throw new ActionError({ code: 'FORBIDDEN' });
  }
}

// Note: submitting an arrangement and uploading a new version carry file
// payloads, so they use API routes (see src/pages/ensembles/[id]/arrangements/)
// instead of actions — matching the song file upload route.
export const arrangements = {
  comment: defineAction({
    accept: 'form',
    input: z.object({
      versionId: z.string(),
      content: z.string().min(1, 'A comment is required.'),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });

      // Commenting is allowed for exactly those who can see the file:
      // the submitter, review-group members, and admins.
      const access = await getArrangementFileWithAccess(input.versionId, user);
      if (!access) throw new ActionError({ code: 'FORBIDDEN' });

      const result = await addArrangementComment(input.versionId, user.id, input.content);
      if (result.error) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      }
    },
  }),

  approve: defineAction({
    accept: 'form',
    input: z.object({
      arrangementId: z.string(),
    }),
    handler: async ({ arrangementId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });

      const arrangement = await getArrangementById(arrangementId);
      if (!arrangement) throw new ActionError({ code: 'NOT_FOUND' });
      await assertCanReview(arrangement.ensembleId, user);

      const result = await approveArrangement(arrangementId, user.id);
      if (result.error) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      }
      return { songId: result.songId };
    },
  }),

  decline: defineAction({
    accept: 'form',
    input: z.object({
      arrangementId: z.string(),
    }),
    handler: async ({ arrangementId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });

      const arrangement = await getArrangementById(arrangementId);
      if (!arrangement) throw new ActionError({ code: 'NOT_FOUND' });
      await assertCanReview(arrangement.ensembleId, user);

      const result = await declineArrangement(arrangementId);
      if (result.error) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      }
    },
  }),

  // Admins can delete any arrangement; submitters can withdraw their own until it's approved.
  delete: defineAction({
    accept: 'form',
    input: z.object({
      arrangementId: z.string(),
    }),
    handler: async ({ arrangementId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });

      const arrangement = await getArrangementById(arrangementId);
      if (!arrangement) throw new ActionError({ code: 'NOT_FOUND' });

      const membership = await getActiveMembership(arrangement.ensembleId, user.id);
      const canWithdraw =
        !!membership && arrangement.submittedBy === user.id && arrangement.status !== 'approved';
      if (!canManageEnsemble(user, membership) && !canWithdraw) {
        throw new ActionError({ code: 'FORBIDDEN' });
      }

      await deleteArrangements([arrangementId]);
    },
  }),

  setReviewGroup: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      groupId: z.string().optional(),
    }),
    handler: async ({ ensembleId, groupId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);

      const result = await setArrangementReviewGroup(ensembleId, groupId || null);
      if (result.error) {
        throw new ActionError({ code: 'BAD_REQUEST', message: result.error });
      }
    },
  }),
};

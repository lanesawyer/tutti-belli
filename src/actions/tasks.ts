import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import {
  createTask,
  editTask,
  deleteTask,
  markTaskComplete,
  markTaskIncomplete,
  getTaskEnsembleId,
} from '@lib/tasks';
import { assertEnsembleAdmin } from './utils';

export const tasks = {
  createTask: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      seasonId: z.string().optional(),
      title: z.string().min(1, 'Task title is required.'),
      description: z.string().optional(),
      sortOrder: z.coerce.number().int().min(0).default(0),
    }),
    handler: async ({ ensembleId, seasonId, title, description, sortOrder }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await createTask(ensembleId, title, description, sortOrder, seasonId);
    },
  }),

  editTask: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      taskId: z.string(),
      title: z.string().min(1, 'Task title is required.'),
      description: z.string().optional(),
      sortOrder: z.coerce.number().int().min(0).default(0),
    }),
    handler: async ({ ensembleId, taskId, title, description, sortOrder }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await editTask(taskId, title, description, sortOrder);
    },
  }),

  deleteTask: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      taskId: z.string(),
    }),
    handler: async ({ ensembleId, taskId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await deleteTask(taskId);
    },
  }),

  markComplete: defineAction({
    accept: 'form',
    input: z.object({
      taskId: z.string(),
      userId: z.string(),
    }),
    handler: async ({ taskId, userId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const ensembleId = await getTaskEnsembleId(taskId);
      if (!ensembleId) throw new ActionError({ code: 'NOT_FOUND' });
      await assertEnsembleAdmin(ensembleId, user);
      await markTaskComplete(taskId, userId, user.id);
    },
  }),

  markIncomplete: defineAction({
    accept: 'form',
    input: z.object({
      taskId: z.string(),
      userId: z.string(),
    }),
    handler: async ({ taskId, userId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const ensembleId = await getTaskEnsembleId(taskId);
      if (!ensembleId) throw new ActionError({ code: 'NOT_FOUND' });
      await assertEnsembleAdmin(ensembleId, user);
      await markTaskIncomplete(taskId, userId);
    },
  }),
};

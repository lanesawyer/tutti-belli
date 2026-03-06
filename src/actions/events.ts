import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { canManageEnsemble } from '@lib/permissions';
import { assertEnsembleAdmin, assertEnsembleMember } from './utils';
import {
  createEvent,
  deleteEvent,
  editEvent,
  checkInToEvent,
  checkInByCode,
  addAttendance,
  removeAttendance,
  setRsvp,
  removeRsvp,
  addProgramSong,
  removeProgramSong,
  updateProgramSongNotes,
  updateProgramEntry,
  reorderProgramSongs,
} from '@lib/events';

export const events = {
  create: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      title: z.string().min(1, 'Title is required.'),
      description: z.string().optional(),
      date: z.string().min(1, 'Date is required.'),
      time: z.string().min(1, 'Time is required.'),
      location: z.string().optional(),
      durationMinutes: z.coerce.number().int().min(15).max(480).default(90),
      category: z.enum(['rehearsal', 'performance', 'social', 'sectional']).default('rehearsal'),
      groupId: z.string().optional(),
      rsvpEnabled: z.string().optional(),
    }),
    handler: async (input, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(input.ensembleId, user);
      const rsvpEnabled = input.rsvpEnabled === '1' ? 1 : input.rsvpEnabled === '0' ? 0 : null;
      try {
        await createEvent({ ...input, groupId: input.groupId || undefined, rsvpEnabled });
      } catch (e) {
        throw new ActionError({ code: 'BAD_REQUEST', message: (e as Error).message });
      }
    },
  }),

  delete: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      eventId: z.string(),
    }),
    handler: async ({ ensembleId, eventId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await deleteEvent(eventId);
    },
  }),

  edit: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      eventId: z.string(),
      title: z.string().min(1, 'Title is required.'),
      description: z.string().optional(),
      date: z.string().min(1, 'Date is required.'),
      time: z.string().min(1, 'Time is required.'),
      location: z.string().optional(),
      durationMinutes: z.coerce.number().int().min(15).max(480).default(90),
      groupId: z.string().optional(),
      rsvpEnabled: z.string().optional(),
    }),
    handler: async ({ ensembleId, rsvpEnabled: rsvpRaw, ...params }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      const rsvpEnabled = rsvpRaw === '1' ? 1 : rsvpRaw === '0' ? 0 : null;
      await editEvent({ ...params, groupId: params.groupId || null, rsvpEnabled });
    },
  }),

  checkIn: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      eventId: z.string(),
    }),
    handler: async ({ ensembleId, eventId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      const membership = await assertEnsembleMember(ensembleId, user);
      const isAdmin = canManageEnsemble(user, membership);
      try {
        await checkInToEvent({ eventId, userId: user.id, ensembleId, isAdmin });
      } catch (e) {
        throw new ActionError({ code: 'FORBIDDEN', message: (e as Error).message });
      }
    },
  }),

  addAttendance: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      eventId: z.string(),
      userId: z.string(),
    }),
    handler: async ({ ensembleId, eventId, userId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await addAttendance(eventId, userId);
    },
  }),

  removeAttendance: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      attendanceId: z.string(),
    }),
    handler: async ({ ensembleId, attendanceId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await removeAttendance(attendanceId);
    },
  }),

  rsvp: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      eventId: z.string(),
      response: z.enum(['yes', 'no']),
    }),
    handler: async ({ ensembleId, eventId, response }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleMember(ensembleId, user);
      await setRsvp(eventId, user.id, response);
    },
  }),

  removeRsvp: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      eventId: z.string(),
    }),
    handler: async ({ ensembleId, eventId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleMember(ensembleId, user);
      await removeRsvp(eventId, user.id);
    },
  }),

  addProgramSong: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      eventId: z.string(),
      songId: z.string(),
      practiceMinutes: z.coerce.number().int().min(1).max(480).optional(),
      notes: z.string().optional(),
    }),
    handler: async ({ ensembleId, eventId, songId, practiceMinutes, notes }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await addProgramSong(eventId, songId, practiceMinutes, notes);
    },
  }),

  removeProgramSong: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      programEntryId: z.string(),
    }),
    handler: async ({ ensembleId, programEntryId }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await removeProgramSong(programEntryId);
    },
  }),

  updateProgramSongNotes: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      programEntryId: z.string(),
      notes: z.string(),
    }),
    handler: async ({ ensembleId, programEntryId, notes }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await updateProgramSongNotes(programEntryId, notes);
    },
  }),

  updateProgramEntry: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      programEntryId: z.string(),
      notes: z.string().optional(),
      practiceMinutes: z.coerce.number().int().min(1).max(480).optional(),
      sortOrder: z.coerce.number().int().min(1).optional(),
    }),
    handler: async ({ ensembleId, programEntryId, notes, practiceMinutes, sortOrder }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      await updateProgramEntry(programEntryId, { notes, practiceMinutes: practiceMinutes ?? null, sortOrder });
    },
  }),

  reorderProgramSongs: defineAction({
    accept: 'form',
    input: z.object({
      ensembleId: z.string(),
      eventId: z.string(),
      orderedEntryIds: z.string(), // JSON array of entry IDs in order
    }),
    handler: async ({ ensembleId, eventId, orderedEntryIds }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      await assertEnsembleAdmin(ensembleId, user);
      let ids: string[];
      try {
        ids = JSON.parse(orderedEntryIds);
      } catch {
        throw new ActionError({ code: 'BAD_REQUEST', message: 'Invalid order data.' });
      }
      await reorderProgramSongs(eventId, ids);
    },
  }),

  checkInByCode: defineAction({
    accept: 'form',
    input: z.object({
      code: z.string(),
    }),
    handler: async ({ code }, context) => {
      const user = context.locals.user;
      if (!user) throw new ActionError({ code: 'UNAUTHORIZED' });
      try {
        return await checkInByCode({ code, userId: user.id });
      } catch (e) {
        throw new ActionError({ code: 'FORBIDDEN', message: (e as Error).message });
      }
    },
  }),
};

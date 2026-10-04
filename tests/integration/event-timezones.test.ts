import { describe, it, expect } from 'vitest';
import { db, eq, Ensemble, Event } from '@db';
import { createEvent, editEvent } from '../../src/lib/events.ts';
import { createUser, createEnsemble, createSeason } from './fixtures.ts';

async function ensembleIn(timezone?: string) {
  const admin = await createUser();
  const ensemble = await createEnsemble(admin!.id);
  if (timezone) await db.update(Ensemble).set({ timezone }).where(eq(Ensemble.id, ensemble!.id));
  await createSeason(ensemble!.id, { isActive: 1 });
  return ensemble!.id;
}

async function onlyEvent(ensembleId: string) {
  return (await db.select().from(Event).where(eq(Event.ensembleId, ensembleId)).get())!;
}

const fields = { title: 'Rehearsal', durationMinutes: 90, category: 'rehearsal' as const };

describe('event times', () => {
  it("are saved in the ensemble's timezone, Pacific by default", async () => {
    const ensembleId = await ensembleIn();

    await createEvent({ ensembleId, date: '2026-10-03', time: '18:25', ...fields });

    expect((await onlyEvent(ensembleId)).scheduledAt.toISOString()).toBe('2026-10-04T01:25:00.000Z');
  });

  it('follow a different ensemble timezone, and edits use it too', async () => {
    const ensembleId = await ensembleIn('Asia/Kolkata');
    await createEvent({ ensembleId, date: '2026-10-03', time: '18:25', ...fields });
    const event = await onlyEvent(ensembleId);
    expect(event.scheduledAt.toISOString()).toBe('2026-10-03T12:55:00.000Z');

    await editEvent({ eventId: event.id, date: '2026-10-04', time: '09:00', title: 'Moved', durationMinutes: 60 });

    expect((await onlyEvent(ensembleId)).scheduledAt.toISOString()).toBe('2026-10-04T03:30:00.000Z');
  });
});

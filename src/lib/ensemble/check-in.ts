import { db, eq, Event, Ensemble } from 'astro:db';

export type CheckInPageData = {
  event: typeof Event.$inferSelect;
  ensemble: typeof Ensemble.$inferSelect;
  canCheckIn: boolean;
  isTooEarly: boolean;
  isTooLate: boolean;
};

export async function getCheckInPageData(code: string): Promise<CheckInPageData | null> {
  const event = await db
    .select()
    .from(Event)
    .where(eq(Event.checkInCode, code.toUpperCase()))
    .get();

  if (!event) return null;

  const ensemble = await db
    .select()
    .from(Ensemble)
    .where(eq(Ensemble.id, event.ensembleId))
    .get();

  if (!ensemble) return null;

  const now = new Date();
  const scheduledTime = new Date(event.scheduledAt);
  const checkInStartTime = new Date(scheduledTime.getTime() - ensemble.checkInStartMinutes * 60 * 1000);
  const checkInEndTime = new Date(scheduledTime.getTime() + ensemble.checkInEndMinutes * 60 * 1000);

  const isTooEarly = now < checkInStartTime;
  const isTooLate = now > checkInEndTime;
  const canCheckIn = !isTooEarly && !isTooLate;

  return { event, ensemble, canCheckIn, isTooEarly, isTooLate };
}

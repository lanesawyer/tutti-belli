import { db, eq, and, inArray, Ensemble, Event, EventProgram, Attendance, EventRsvp, Season, User, EnsembleMember, Song, SeasonSong, Group, GroupMembership } from 'astro:db';

// ─── RSVP Helpers ───────────────────────────────────────────────────────────

const RSVP_CATEGORY_DEFAULTS: Record<string, boolean> = {
  rehearsal: false,
  performance: true,
  social: true,
  sectional: false,
};

export function isRsvpEnabled(event: { category: string; rsvpEnabled: number | null }): boolean {
  if (event.rsvpEnabled !== null && event.rsvpEnabled !== undefined) {
    return event.rsvpEnabled === 1;
  }
  return RSVP_CATEGORY_DEFAULTS[event.category] ?? false;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getEvent(eventId: string) {
  return db.select().from(Event).where(eq(Event.id, eventId)).get() ?? null;
}

export async function getEventPageData(ensembleId: string, eventId: string) {
  const [event, ensembleData, attendanceRecords, rsvpRecords] = await Promise.all([
    db.select().from(Event).where(eq(Event.id, eventId)).get(),
    db.select().from(Ensemble).where(eq(Ensemble.id, ensembleId)).get(),
    db
      .select({
        id: Attendance.id,
        userId: User.id,
        userName: User.name,
        checkedInAt: Attendance.checkedInAt,
        checkedInMethod: Attendance.checkedInMethod,
      })
      .from(Attendance)
      .innerJoin(User, eq(Attendance.userId, User.id))
      .where(eq(Attendance.eventId, eventId))
      .all(),
    db
      .select({
        userId: EventRsvp.userId,
        userName: User.name,
        response: EventRsvp.response,
        respondedAt: EventRsvp.respondedAt,
      })
      .from(EventRsvp)
      .innerJoin(User, eq(EventRsvp.userId, User.id))
      .where(eq(EventRsvp.eventId, eventId))
      .all(),
  ]);

  let group: { id: string; name: string; color: string } | null = null;
  let allMembers: { id: string; name: string; email: string }[];

  if (event?.groupId) {
    const [groupRow, groupMembers] = await Promise.all([
      db.select({ id: Group.id, name: Group.name, color: Group.color })
        .from(Group)
        .where(eq(Group.id, event.groupId))
        .get(),
      db.select({ id: User.id, name: User.name, email: User.email })
        .from(GroupMembership)
        .innerJoin(User, eq(GroupMembership.userId, User.id))
        .innerJoin(EnsembleMember, and(
          eq(EnsembleMember.userId, User.id),
          eq(EnsembleMember.ensembleId, ensembleId),
        ))
        .where(eq(GroupMembership.groupId, event.groupId))
        .all(),
    ]);
    if (groupRow) {
      group = groupRow;
      allMembers = groupMembers;
    } else {
      // Group was deleted — fall back to all ensemble members
      allMembers = await db
        .select({ id: User.id, name: User.name, email: User.email })
        .from(EnsembleMember)
        .innerJoin(User, eq(EnsembleMember.userId, User.id))
        .where(eq(EnsembleMember.ensembleId, ensembleId))
        .all();
    }
  } else {
    allMembers = await db
      .select({ id: User.id, name: User.name, email: User.email })
      .from(EnsembleMember)
      .innerJoin(User, eq(EnsembleMember.userId, User.id))
      .where(eq(EnsembleMember.ensembleId, ensembleId))
      .all();
  }

  return { event: event ?? null, ensembleData: ensembleData ?? null, attendanceRecords, rsvpRecords, allMembers, group };
}

export async function getEventProgramData(eventId: string, seasonId: string) {
  const [programSongs, allSeasonSongs] = await Promise.all([
    db
      .select({
        entryId: EventProgram.id,
        id: Song.id,
        name: Song.name,
        composer: Song.composer,
        sortOrder: EventProgram.sortOrder,
        notes: EventProgram.notes,
      })
      .from(EventProgram)
      .innerJoin(Song, eq(EventProgram.songId, Song.id))
      .where(eq(EventProgram.eventId, eventId))
      .orderBy(EventProgram.sortOrder)
      .all(),
    db
      .select({ id: Song.id, name: Song.name, composer: Song.composer })
      .from(SeasonSong)
      .innerJoin(Song, eq(SeasonSong.songId, Song.id))
      .where(eq(SeasonSong.seasonId, seasonId))
      .orderBy(Song.name)
      .all(),
  ]);

  const programSongIds = new Set(programSongs.map(s => s.id));
  const availableSeasonSongs = allSeasonSongs.filter(s => !programSongIds.has(s.id));

  return { programSongs, availableSeasonSongs };
}

export async function getEventsPageData(ensembleId: string, userId: string) {
  const [activeSeason, events, groups] = await Promise.all([
    db
      .select()
      .from(Season)
      .where(and(eq(Season.ensembleId, ensembleId), eq(Season.isActive, 1)))
      .get(),
    db
      .select({
        id: Event.id,
        ensembleId: Event.ensembleId,
        seasonId: Event.seasonId,
        category: Event.category,
        title: Event.title,
        description: Event.description,
        scheduledAt: Event.scheduledAt,
        durationMinutes: Event.durationMinutes,
        location: Event.location,
        checkInCode: Event.checkInCode,
        groupId: Event.groupId,
        groupName: Group.name,
        groupColor: Group.color,
        rsvpEnabled: Event.rsvpEnabled,
        createdAt: Event.createdAt,
      })
      .from(Event)
      .leftJoin(Group, eq(Event.groupId, Group.id))
      .where(eq(Event.ensembleId, ensembleId))
      .orderBy(Event.scheduledAt)
      .all(),
    db
      .select({ id: Group.id, name: Group.name, color: Group.color })
      .from(Group)
      .where(eq(Group.ensembleId, ensembleId))
      .orderBy(Group.name)
      .all(),
  ]);

  // Fetch the current user's RSVPs for all events in one query
  const userRsvpMap = new Map<string, 'yes' | 'no'>();
  if (events.length > 0) {
    const eventIds = events.map(e => e.id);
    const rsvps = await db
      .select({ eventId: EventRsvp.eventId, response: EventRsvp.response })
      .from(EventRsvp)
      .where(and(eq(EventRsvp.userId, userId), inArray(EventRsvp.eventId, eventIds)))
      .all();
    for (const r of rsvps) {
      userRsvpMap.set(r.eventId, r.response as 'yes' | 'no');
    }
  }

  return { activeSeason: activeSeason ?? null, events, groups, userRsvpMap };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function createEvent(params: {
  ensembleId: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  location?: string;
  durationMinutes: number;
  category: 'rehearsal' | 'performance' | 'social' | 'sectional';
  groupId?: string;
  rsvpEnabled?: number | null;
}) {
  const { ensembleId, title, description, date, time, location, durationMinutes, category, groupId, rsvpEnabled } = params;

  const activeSeason = await db
    .select()
    .from(Season)
    .where(and(eq(Season.ensembleId, ensembleId), eq(Season.isActive, 1)))
    .get();

  if (!activeSeason) {
    throw new Error('No active season found. Please create and activate a season first.');
  }

  const scheduledAt = new Date(`${date}T${time}`);
  const checkInCode = Math.random().toString(36).substring(2, 10).toUpperCase();

  await db.insert(Event).values({
    id: crypto.randomUUID(),
    ensembleId,
    seasonId: activeSeason.id,
    category,
    title,
    description: description || '',
    scheduledAt,
    durationMinutes,
    location: location || '',
    checkInCode,
    groupId: groupId || null,
    rsvpEnabled: rsvpEnabled ?? null,
  });
}

export async function deleteEvent(eventId: string) {
  await db.delete(Event).where(eq(Event.id, eventId));
}

export async function editEvent(params: {
  eventId: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  location?: string;
  durationMinutes: number;
  groupId?: string | null;
  rsvpEnabled?: number | null;
}) {
  const { eventId, title, description, date, time, location, durationMinutes, groupId, rsvpEnabled } = params;
  const scheduledAt = new Date(`${date}T${time}`);

  await db.update(Event)
    .set({
      title: title.trim(),
      description: description?.trim() || '',
      scheduledAt,
      durationMinutes,
      location: location?.trim() || '',
      groupId: groupId || null,
      rsvpEnabled: rsvpEnabled ?? null,
    })
    .where(eq(Event.id, eventId));
}

export async function checkInToEvent(params: {
  eventId: string;
  userId: string;
  ensembleId: string;
  isAdmin: boolean;
}) {
  const { eventId, userId, ensembleId, isAdmin } = params;

  const [event, ensembleData] = await Promise.all([
    db.select().from(Event).where(eq(Event.id, eventId)).get(),
    db.select().from(Ensemble).where(eq(Ensemble.id, ensembleId)).get(),
  ]);

  if (!event) throw new Error('Event not found.');
  if (!ensembleData) throw new Error('Ensemble not found.');

  const now = new Date();
  const scheduledTime = new Date(event.scheduledAt);
  const checkInStartTime = new Date(scheduledTime.getTime() - (ensembleData.checkInStartMinutes * 60 * 1000));
  const checkInEndTime = new Date(scheduledTime.getTime() + (ensembleData.checkInEndMinutes * 60 * 1000));
  const canCheckIn = now >= checkInStartTime && now <= checkInEndTime;

  if (!canCheckIn && !isAdmin) {
    const isTooEarly = now < checkInStartTime;
    if (isTooEarly) {
      const minutesUntilOpen = Math.ceil((checkInStartTime.getTime() - now.getTime()) / (60 * 1000));
      throw new Error(`Check-in opens ${ensembleData.checkInStartMinutes} minutes before the event (in ${minutesUntilOpen} minutes).`);
    } else {
      throw new Error(`Check-in closed ${ensembleData.checkInEndMinutes} minutes after event start.`);
    }
  }

  const existing = await db
    .select()
    .from(Attendance)
    .where(and(eq(Attendance.eventId, eventId), eq(Attendance.userId, userId)))
    .get();

  if (existing) throw new Error('You have already checked in for this event.');

  await db.insert(Attendance).values({
    id: crypto.randomUUID(),
    eventId,
    userId,
    checkedInMethod: 'manual',
  });
}

export async function checkInByCode(params: { code: string; userId: string }) {
  const { code, userId } = params;

  const event = await db.select().from(Event).where(eq(Event.checkInCode, code.toUpperCase())).get();
  if (!event) throw new Error('Invalid check-in code.');

  const ensembleData = await db.select().from(Ensemble).where(eq(Ensemble.id, event.ensembleId)).get();
  if (!ensembleData) throw new Error('Ensemble not found.');

  const now = new Date();
  const scheduledTime = new Date(event.scheduledAt);
  const checkInStartTime = new Date(scheduledTime.getTime() - ensembleData.checkInStartMinutes * 60 * 1000);
  const checkInEndTime = new Date(scheduledTime.getTime() + ensembleData.checkInEndMinutes * 60 * 1000);

  if (now < checkInStartTime) {
    const minutesUntilOpen = Math.ceil((checkInStartTime.getTime() - now.getTime()) / (60 * 1000));
    throw new Error(`Check-in opens ${ensembleData.checkInStartMinutes} minutes before the event (in ${minutesUntilOpen} minutes).`);
  }
  if (now > checkInEndTime) {
    throw new Error(`Check-in closed ${ensembleData.checkInEndMinutes} minutes after event start.`);
  }

  const existing = await db
    .select()
    .from(Attendance)
    .where(and(eq(Attendance.eventId, event.id), eq(Attendance.userId, userId)))
    .get();

  if (existing) throw new Error('You have already checked in for this event.');

  await db.insert(Attendance).values({
    id: crypto.randomUUID(),
    eventId: event.id,
    userId,
    checkedInMethod: 'qr',
  });

  return { eventId: event.id, ensembleId: event.ensembleId };
}

export async function addAttendance(eventId: string, userId: string) {
  const existing = await db
    .select()
    .from(Attendance)
    .where(and(eq(Attendance.eventId, eventId), eq(Attendance.userId, userId)))
    .get();

  if (!existing) {
    await db.insert(Attendance).values({
      id: crypto.randomUUID(),
      eventId,
      userId,
      checkedInMethod: 'admin',
    });
  }
}

export async function removeAttendance(attendanceId: string) {
  await db.delete(Attendance).where(eq(Attendance.id, attendanceId));
}

export async function setRsvp(eventId: string, userId: string, response: 'yes' | 'no') {
  const existing = await db
    .select()
    .from(EventRsvp)
    .where(and(eq(EventRsvp.eventId, eventId), eq(EventRsvp.userId, userId)))
    .get();

  if (existing) {
    await db.update(EventRsvp)
      .set({ response, respondedAt: new Date() })
      .where(and(eq(EventRsvp.eventId, eventId), eq(EventRsvp.userId, userId)));
  } else {
    await db.insert(EventRsvp).values({
      id: crypto.randomUUID(),
      eventId,
      userId,
      response,
    });
  }
}

export async function removeRsvp(eventId: string, userId: string) {
  await db.delete(EventRsvp)
    .where(and(eq(EventRsvp.eventId, eventId), eq(EventRsvp.userId, userId)));
}

export async function getRsvpForUser(eventId: string, userId: string): Promise<'yes' | 'no' | null> {
  const record = await db
    .select({ response: EventRsvp.response })
    .from(EventRsvp)
    .where(and(eq(EventRsvp.eventId, eventId), eq(EventRsvp.userId, userId)))
    .get();
  return record ? (record.response as 'yes' | 'no') : null;
}

export async function addProgramSong(eventId: string, songId: string, notes?: string) {
  const currentProgram = await db
    .select({ sortOrder: EventProgram.sortOrder })
    .from(EventProgram)
    .where(eq(EventProgram.eventId, eventId))
    .all();

  const maxOrder = currentProgram.length > 0
    ? Math.max(...currentProgram.map(p => p.sortOrder))
    : 0;

  await db.insert(EventProgram).values({
    id: crypto.randomUUID(),
    eventId,
    songId,
    sortOrder: maxOrder + 1,
    notes: notes || undefined,
  });
}

export async function updateProgramSongNotes(programEntryId: string, notes: string) {
  await db
    .update(EventProgram)
    .set({ notes: notes.trim() || null })
    .where(eq(EventProgram.id, programEntryId));
}

export async function removeProgramSong(programEntryId: string) {
  await db.delete(EventProgram).where(eq(EventProgram.id, programEntryId));
}

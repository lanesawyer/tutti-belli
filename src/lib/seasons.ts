import { db, eq, and, desc, Season, SeasonMembership, EnsembleMember, Event, User } from 'astro:db';

export async function getEnsembleSeasons(ensembleId: string) {
  return await db
    .select()
    .from(Season)
    .where(eq(Season.ensembleId, ensembleId))
    .orderBy(desc(Season.createdAt))
    .all();
}

export async function getSeasonMembershipsWithUsers(ensembleId: string) {
  return await db
    .select({
      seasonId: SeasonMembership.seasonId,
      userId: SeasonMembership.userId,
      userName: User.name,
    })
    .from(SeasonMembership)
    .innerJoin(Season, eq(SeasonMembership.seasonId, Season.id))
    .innerJoin(User, eq(SeasonMembership.userId, User.id))
    .where(eq(Season.ensembleId, ensembleId))
    .all();
}

export async function getEnsembleMembersBasic(ensembleId: string) {
  return await db
    .select({ id: User.id, name: User.name, email: User.email })
    .from(EnsembleMember)
    .innerJoin(User, eq(EnsembleMember.userId, User.id))
    .where(eq(EnsembleMember.ensembleId, ensembleId))
    .all();
}

export async function createSeason(
  ensembleId: string,
  name: string,
  startDate: Date | undefined,
  endDate: Date | undefined,
  setActive: boolean,
) {
  if (setActive) {
    await db.update(Season).set({ isActive: 0 }).where(eq(Season.ensembleId, ensembleId));
  }
  await db.insert(Season).values({
    id: crypto.randomUUID(),
    ensembleId,
    name,
    startDate,
    endDate,
    isActive: setActive ? 1 : 0,
  });
}

export async function updateSeason(
  seasonId: string,
  ensembleId: string,
  name: string,
  startDate: Date | undefined,
  endDate: Date | undefined,
  setActive: boolean,
) {
  if (setActive) {
    await db.update(Season).set({ isActive: 0 }).where(eq(Season.ensembleId, ensembleId));
  }
  await db
    .update(Season)
    .set({
      name,
      startDate,
      endDate,
      isActive: setActive ? 1 : 0,
    })
    .where(eq(Season.id, seasonId));
}

export async function deleteSeason(seasonId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const hasEvents = await db
    .select()
    .from(Event)
    .where(eq(Event.seasonId, seasonId))
    .limit(1)
    .get();

  if (hasEvents) {
    return { ok: false, error: 'Cannot delete a season that has rehearsals.' };
  }

  await db.delete(SeasonMembership).where(eq(SeasonMembership.seasonId, seasonId));
  await db.delete(Season).where(eq(Season.id, seasonId));
  return { ok: true };
}

export async function toggleSeasonMember(seasonId: string, userId: string) {
  const [existing] = await db
    .select()
    .from(SeasonMembership)
    .where(and(eq(SeasonMembership.seasonId, seasonId), eq(SeasonMembership.userId, userId)));

  if (existing) {
    await db.delete(SeasonMembership).where(eq(SeasonMembership.id, existing.id));
  } else {
    await db.insert(SeasonMembership).values({
      id: crypto.randomUUID(),
      seasonId,
      userId,
    });
  }
}

import { describe, it, expect } from 'vitest';
import { db, Season, SeasonMembership, eq } from 'astro:db';
import {
  createSeason,
  updateSeason,
  deleteSeason,
  toggleSeasonMember,
  getSeasonMembershipsWithUsers,
} from '../../src/lib/seasons.ts';
import { createUser, createEnsemble, createSeason as createSeasonFixture, createEvent } from './fixtures.ts';

describe('createSeason', () => {
  it('inserts a season row', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createSeason(ensemble!.id, 'Fall 2025', undefined, undefined, false);

    const seasons = await db
      .select()
      .from(Season)
      .where(eq(Season.ensembleId, ensemble!.id))
      .all();

    expect(seasons).toHaveLength(1);
    expect(seasons[0].name).toBe('Fall 2025');
    expect(seasons[0].isActive).toBe(0);
  });

  it('sets the new season as active when setActive is true', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createSeason(ensemble!.id, 'Active Season', undefined, undefined, true);

    const [season] = await db
      .select()
      .from(Season)
      .where(eq(Season.ensembleId, ensemble!.id))
      .all();

    expect(season.isActive).toBe(1);
  });

  it('deactivates existing active seasons when setActive is true', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);

    await createSeasonFixture(ensemble!.id, { name: 'Old Season', isActive: 1 });
    await createSeason(ensemble!.id, 'New Season', undefined, undefined, true);

    const seasons = await db
      .select()
      .from(Season)
      .where(eq(Season.ensembleId, ensemble!.id))
      .all();

    const oldSeason = seasons.find((s) => s.name === 'Old Season')!;
    const newSeason = seasons.find((s) => s.name === 'New Season')!;

    expect(oldSeason.isActive).toBe(0);
    expect(newSeason.isActive).toBe(1);
  });

  it('stores start and end dates', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const start = new Date('2025-09-01');
    const end = new Date('2025-12-31');

    await createSeason(ensemble!.id, 'Dated Season', start, end, false);

    const [season] = await db
      .select()
      .from(Season)
      .where(eq(Season.ensembleId, ensemble!.id))
      .all();

    expect(new Date(season.startDate!).toISOString().slice(0, 10)).toBe('2025-09-01');
    expect(new Date(season.endDate!).toISOString().slice(0, 10)).toBe('2025-12-31');
  });
});

describe('updateSeason', () => {
  it('updates name and dates', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeasonFixture(ensemble!.id, { name: 'Old Name' });

    await updateSeason(
      season!.id,
      ensemble!.id,
      'New Name',
      new Date('2026-01-01'),
      new Date('2026-05-31'),
      false,
    );

    const updated = await db.select().from(Season).where(eq(Season.id, season!.id)).get();
    expect(updated!.name).toBe('New Name');
    expect(new Date(updated!.startDate!).toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('deactivates other seasons in the ensemble when setActive is true', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const seasonA = await createSeasonFixture(ensemble!.id, { name: 'A', isActive: 1 });
    const seasonB = await createSeasonFixture(ensemble!.id, { name: 'B', isActive: 0 });

    await updateSeason(seasonB!.id, ensemble!.id, 'B', undefined, undefined, true);

    const a = await db.select().from(Season).where(eq(Season.id, seasonA!.id)).get();
    const b = await db.select().from(Season).where(eq(Season.id, seasonB!.id)).get();

    expect(a!.isActive).toBe(0);
    expect(b!.isActive).toBe(1);
  });
});

describe('deleteSeason', () => {
  it('deletes the season when it has no events', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeasonFixture(ensemble!.id);

    const result = await deleteSeason(season!.id);
    expect(result.ok).toBe(true);

    const row = await db.select().from(Season).where(eq(Season.id, season!.id)).get();
    expect(row).toBeUndefined();
  });

  it('returns an error when the season has events', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeasonFixture(ensemble!.id);
    await createEvent(ensemble!.id, season!.id);

    const result = await deleteSeason(season!.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/rehearsal/i);

    // Season still exists
    const row = await db.select().from(Season).where(eq(Season.id, season!.id)).get();
    expect(row).toBeDefined();
  });

  it('removes SeasonMembership rows when deleting', async () => {
    const admin = await createUser();
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeasonFixture(ensemble!.id);

    await db.insert(SeasonMembership).values({
      id: crypto.randomUUID(),
      seasonId: season!.id,
      userId: member!.id,
    });

    await deleteSeason(season!.id);

    const memberships = await db
      .select()
      .from(SeasonMembership)
      .where(eq(SeasonMembership.seasonId, season!.id))
      .all();

    expect(memberships).toHaveLength(0);
  });
});

describe('toggleSeasonMember', () => {
  it('adds a membership when none exists', async () => {
    const admin = await createUser();
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeasonFixture(ensemble!.id);

    await toggleSeasonMember(season!.id, member!.id);

    const memberships = await db
      .select()
      .from(SeasonMembership)
      .where(eq(SeasonMembership.seasonId, season!.id))
      .all();

    expect(memberships).toHaveLength(1);
    expect(memberships[0].userId).toBe(member!.id);
  });

  it('removes the membership when one already exists', async () => {
    const admin = await createUser();
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeasonFixture(ensemble!.id);

    await toggleSeasonMember(season!.id, member!.id);
    await toggleSeasonMember(season!.id, member!.id);

    const memberships = await db
      .select()
      .from(SeasonMembership)
      .where(eq(SeasonMembership.seasonId, season!.id))
      .all();

    expect(memberships).toHaveLength(0);
  });
});

describe('getSeasonMembershipsWithUsers', () => {
  it('returns memberships for the given ensemble only', async () => {
    const admin = await createUser();
    const ensembleA = await createEnsemble(admin!.id, { name: 'Ensemble A' });
    const ensembleB = await createEnsemble(admin!.id, { name: 'Ensemble B' });
    const member = await createUser({ name: 'Alice' });

    const seasonA = await createSeasonFixture(ensembleA!.id, { name: 'Season A' });
    const seasonB = await createSeasonFixture(ensembleB!.id, { name: 'Season B' });

    await toggleSeasonMember(seasonA!.id, member!.id);
    await toggleSeasonMember(seasonB!.id, member!.id);

    const results = await getSeasonMembershipsWithUsers(ensembleA!.id);

    const seasonIds = results.map((r) => r.seasonId);
    expect(seasonIds).toContain(seasonA!.id);
    expect(seasonIds).not.toContain(seasonB!.id);
  });

  it('includes the user name from the join', async () => {
    const admin = await createUser();
    const member = await createUser({ name: 'Bob Member' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeasonFixture(ensemble!.id);

    await toggleSeasonMember(season!.id, member!.id);

    const results = await getSeasonMembershipsWithUsers(ensemble!.id);
    expect(results).toHaveLength(1);
    expect(results[0].userName).toBe('Bob Member');
  });
});

/**
 * Mock for the `astro:db` virtual module.
 *
 * `astro:db` is a Vite virtual module generated at build time — it doesn't
 * exist on the filesystem and can't be imported by Vitest directly. This file
 * is aliased to `astro:db` in vitest.config.ts so all imports resolve here.
 *
 * It:
 * 1. Creates an in-memory LibSQL database (`?cache=shared` keeps one shared
 *    instance per process — required with `singleThread: true`)
 * 2. Converts Astro table configs → Drizzle table objects via `asDrizzleTable`
 * 3. Re-exports all query helpers (`eq`, `and`, etc.) that the real module provides
 * 4. Re-exports `column`, `defineTable`, `defineDb`, `NOW` so that `db/config.ts`
 *    can import from `astro:db` without errors (it uses these to define the schema)
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
// @astrojs/db/runtime is the public export for the runtime (maps to dist/runtime/index.js)
import { asDrizzleTable } from '@astrojs/db/runtime';
// Re-export schema helpers so db/config.ts imports resolve correctly.
// @astrojs/db/dist/runtime/virtual.js is explicitly listed in the package exports map.
export { column, defineTable, defineDb, NOW } from '@astrojs/db/dist/runtime/virtual.js';

// Import the raw table configs from db/config.ts.
// These are plain objects (the output of defineTable()) — not Drizzle tables yet.
import dbConfig from '../../../db/config.ts';

// Single in-memory database shared across all test code in this process.
// `?cache=shared` ensures all createClient() calls with this URL get the same instance.
const client = createClient({ url: 'file::memory:?cache=shared' });
export const db = drizzle(client);

// Access the tables object from the defineDb() config
const tables = (dbConfig as any).tables ?? {};

// Convert each Astro table config to a Drizzle SQLite table — identical to
// what the real `astro:db` virtual module does via vite-plugin-db.js
export const User = asDrizzleTable('User', tables.User);
export const Ensemble = asDrizzleTable('Ensemble', tables.Ensemble);
export const EnsembleMember = asDrizzleTable('EnsembleMember', tables.EnsembleMember);
export const Part = asDrizzleTable('Part', tables.Part);
export const MemberPart = asDrizzleTable('MemberPart', tables.MemberPart);
export const EnsembleInvite = asDrizzleTable('EnsembleInvite', tables.EnsembleInvite);
export const Season = asDrizzleTable('Season', tables.Season);
export const SeasonMembership = asDrizzleTable('SeasonMembership', tables.SeasonMembership);
export const Event = asDrizzleTable('Event', tables.Event);
export const Attendance = asDrizzleTable('Attendance', tables.Attendance);
export const EventRsvp = asDrizzleTable('EventRsvp', tables.EventRsvp);
export const Announcement = asDrizzleTable('Announcement', tables.Announcement);
export const Group = asDrizzleTable('Group', tables.Group);
export const GroupMembership = asDrizzleTable('GroupMembership', tables.GroupMembership);
export const Song = asDrizzleTable('Song', tables.Song);
export const SongPart = asDrizzleTable('SongPart', tables.SongPart);
export const SeasonSong = asDrizzleTable('SeasonSong', tables.SeasonSong);
export const SongFile = asDrizzleTable('SongFile', tables.SongFile);
export const EventProgram = asDrizzleTable('EventProgram', tables.EventProgram);
export const PasswordResetToken = asDrizzleTable('PasswordResetToken', tables.PasswordResetToken);
export const EmailChangeToken = asDrizzleTable('EmailChangeToken', tables.EmailChangeToken);
export const EmailVerificationToken = asDrizzleTable('EmailVerificationToken', tables.EmailVerificationToken);
export const EnsembleLink = asDrizzleTable('EnsembleLink', tables.EnsembleLink);
export const SiteBanner = asDrizzleTable('SiteBanner', tables.SiteBanner);
export const Task = asDrizzleTable('Task', tables.Task);
export const TaskCompletion = asDrizzleTable('TaskCompletion', tables.TaskCompletion);

// Re-export query helpers — these are all the same imports that `astro:db` exposes
export {
  eq,
  gt,
  gte,
  lt,
  lte,
  ne,
  isNull,
  isNotNull,
  inArray,
  notInArray,
  and,
  or,
  not,
  sql,
  asc,
  desc,
  count,
  countDistinct,
  avg,
  sum,
  max,
  min,
  exists,
  notExists,
  between,
  notBetween,
  like,
  notLike,
} from 'drizzle-orm';
export { alias } from 'drizzle-orm/sqlite-core';

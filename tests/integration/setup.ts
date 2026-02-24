/**
 * Integration test setup — runs before each test file (via setupFiles in vitest.config.ts).
 * Drops and recreates all tables in the in-memory SQLite database,
 * giving each test a clean slate.
 *
 * We write the DDL directly rather than using @astrojs/db internals, since
 * @astrojs/db/dist/core/queries.js is not in the package's exports map.
 * This SQL mirrors the schema defined in db/config.ts exactly.
 */
import { beforeEach } from 'vitest';
import { createClient } from '@libsql/client';

// Must use the same URL as the mock so we operate on the same in-memory DB instance
const client = createClient({ url: 'file::memory:?cache=shared' });

// Tables in dependency order (children after parents) for CREATE,
// and reversed for DROP to avoid foreign key violations.
const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "role" TEXT DEFAULT 'user' NOT NULL,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Ensemble" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT UNIQUE,
    "description" TEXT,
    "imageUrl" TEXT,
    "discordLink" TEXT,
    "codeOfConduct" TEXT,
    "checkInStartMinutes" INTEGER DEFAULT 30 NOT NULL,
    "checkInEndMinutes" INTEGER DEFAULT 15 NOT NULL,
    "createdBy" TEXT NOT NULL REFERENCES "User"("id"),
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Part" (
    "id" TEXT PRIMARY KEY,
    "ensembleId" TEXT NOT NULL REFERENCES "Ensemble"("id"),
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER DEFAULT 0 NOT NULL,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "EnsembleMember" (
    "id" TEXT PRIMARY KEY,
    "ensembleId" TEXT NOT NULL REFERENCES "Ensemble"("id"),
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "role" TEXT DEFAULT 'member' NOT NULL,
    "status" TEXT DEFAULT 'pending' NOT NULL,
    "partId" TEXT REFERENCES "Part"("id"),
    "agreedToCodeOfConductAt" TEXT,
    "joinedAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "EnsembleInvite" (
    "id" TEXT PRIMARY KEY,
    "ensembleId" TEXT NOT NULL REFERENCES "Ensemble"("id"),
    "code" TEXT UNIQUE NOT NULL,
    "createdBy" TEXT NOT NULL REFERENCES "User"("id"),
    "expiresAt" TEXT,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Season" (
    "id" TEXT PRIMARY KEY,
    "ensembleId" TEXT NOT NULL REFERENCES "Ensemble"("id"),
    "name" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "isActive" INTEGER DEFAULT 1 NOT NULL,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "SeasonMembership" (
    "id" TEXT PRIMARY KEY,
    "seasonId" TEXT NOT NULL REFERENCES "Season"("id"),
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "joinedAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Event" (
    "id" TEXT PRIMARY KEY,
    "ensembleId" TEXT NOT NULL REFERENCES "Ensemble"("id"),
    "seasonId" TEXT NOT NULL REFERENCES "Season"("id"),
    "category" TEXT DEFAULT 'rehearsal' NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TEXT NOT NULL,
    "durationMinutes" INTEGER DEFAULT 90 NOT NULL,
    "location" TEXT,
    "checkInCode" TEXT UNIQUE NOT NULL,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Attendance" (
    "id" TEXT PRIMARY KEY,
    "eventId" TEXT NOT NULL REFERENCES "Event"("id"),
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "checkedInAt" TEXT DEFAULT CURRENT_TIMESTAMP,
    "checkedInMethod" TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "Announcement" (
    "id" TEXT PRIMARY KEY,
    "ensembleId" TEXT NOT NULL REFERENCES "Ensemble"("id"),
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL REFERENCES "User"("id"),
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Group" (
    "id" TEXT PRIMARY KEY,
    "ensembleId" TEXT NOT NULL REFERENCES "Ensemble"("id"),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT 'info' NOT NULL,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "GroupMembership" (
    "id" TEXT PRIMARY KEY,
    "groupId" TEXT NOT NULL REFERENCES "Group"("id"),
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "addedAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Song" (
    "id" TEXT PRIMARY KEY,
    "ensembleId" TEXT NOT NULL REFERENCES "Ensemble"("id"),
    "name" TEXT NOT NULL,
    "composer" TEXT,
    "arranger" TEXT,
    "runTime" INTEGER,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "SongPart" (
    "id" TEXT PRIMARY KEY,
    "songId" TEXT NOT NULL REFERENCES "Song"("id"),
    "partId" TEXT NOT NULL REFERENCES "Part"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "SeasonSong" (
    "id" TEXT PRIMARY KEY,
    "seasonId" TEXT NOT NULL REFERENCES "Season"("id"),
    "songId" TEXT NOT NULL REFERENCES "Song"("id"),
    "addedAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "SongFile" (
    "id" TEXT PRIMARY KEY,
    "songId" TEXT NOT NULL REFERENCES "Song"("id"),
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT DEFAULT 'other' NOT NULL,
    "uploadedBy" TEXT NOT NULL REFERENCES "User"("id"),
    "uploadedAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "EventProgram" (
    "id" TEXT PRIMARY KEY,
    "eventId" TEXT NOT NULL REFERENCES "Event"("id"),
    "songId" TEXT NOT NULL REFERENCES "Song"("id"),
    "sortOrder" INTEGER DEFAULT 0 NOT NULL,
    "notes" TEXT,
    "addedAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "EnsembleLink" (
    "id" TEXT PRIMARY KEY,
    "ensembleId" TEXT NOT NULL REFERENCES "Ensemble"("id"),
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER DEFAULT 0 NOT NULL,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "token" TEXT UNIQUE NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "usedAt" TEXT,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "EmailChangeToken" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id"),
    "token" TEXT UNIQUE NOT NULL,
    "newEmail" TEXT NOT NULL,
    "expiresAt" TEXT NOT NULL,
    "usedAt" TEXT,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "SiteBanner" (
    "id" TEXT PRIMARY KEY,
    "message" TEXT NOT NULL,
    "color" TEXT DEFAULT 'info' NOT NULL,
    "isActive" INTEGER DEFAULT 1 NOT NULL,
    "createdAt" TEXT DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
];

const TABLE_NAMES = [
  'SiteBanner', 'EmailChangeToken', 'PasswordResetToken', 'EventProgram', 'SongFile',
  'SeasonSong', 'SongPart', 'Song', 'GroupMembership', 'Group',
  'Announcement', 'Attendance', 'Event', 'SeasonMembership', 'EnsembleInvite',
  'Season', 'EnsembleLink', 'EnsembleMember', 'Part', 'Ensemble', 'User',
];

async function recreateSchema() {
  // Disable foreign keys during drop to avoid constraint errors
  await client.execute('PRAGMA foreign_keys = OFF');
  for (const name of TABLE_NAMES) {
    await client.execute(`DROP TABLE IF EXISTS "${name}"`);
  }
  await client.execute('PRAGMA foreign_keys = ON');
  for (const sql of CREATE_STATEMENTS) {
    await client.execute(sql);
  }
}

beforeEach(async () => {
  await recreateSchema();
});

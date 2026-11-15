import { sql } from 'drizzle-orm';
import { customType, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Mirrors @astrojs/db's date column exactly: stored as TEXT (ISO-8601),
// surfaced as Date. CURRENT_TIMESTAMP defaults are written by SQLite as
// "YYYY-MM-DD HH:MM:SS" (UTC, no zone marker), so a "Z" is appended on read.
const isISODateString = (str: string) => /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str);
const date = customType<{ data: Date; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => value.toISOString(),
  fromDriver: (value) => new Date(isISODateString(value) ? value : `${value}Z`),
});

const NOW = sql`CURRENT_TIMESTAMP`;

export const User = sqliteTable('User', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatarUrl'),
  phone: text('phone'),
  role: text('role', { enum: ['admin', 'ensemble_admin', 'user'] }).notNull().default('user'),
  emailVerifiedAt: date('emailVerifiedAt'),
  sessionVersion: integer('sessionVersion').notNull().default(0), // Bumped to sign the user out of every existing session
  createdAt: date('createdAt').notNull().default(NOW),
});

export const Ensemble = sqliteTable('Ensemble', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  description: text('description'),
  imageUrl: text('imageUrl'),
  discordLink: text('discordLink'),
  discordWebhookUrl: text('discordWebhookUrl'),
  codeOfConduct: text('codeOfConduct'),
  checkInStartMinutes: integer('checkInStartMinutes').notNull().default(30), // Minutes before event check-in opens
  checkInEndMinutes: integer('checkInEndMinutes').notNull().default(15), // Minutes after event start check-in closes
  timezone: text('timezone').notNull().default('America/Los_Angeles'), // IANA zone that event times are entered and shown in
  createdBy: text('createdBy').references(() => User.id, { onDelete: 'set null' }),
  createdAt: date('createdAt').notNull().default(NOW),
});

export const EnsembleMember = sqliteTable('EnsembleMember', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => User.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'admin', 'member'
  status: text('status').notNull().default('pending'), // 'pending', 'active'
  agreedToCodeOfConductAt: date('agreedToCodeOfConductAt'),
  joinedAt: date('joinedAt').notNull().default(NOW),
}, (t) => [
  uniqueIndex('EnsembleMember_ensembleId_userId_unique').on(t.ensembleId, t.userId),
  index('EnsembleMember_userId_idx').on(t.userId),
]);

export const Part = sqliteTable('Part', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('Part_ensembleId_idx').on(t.ensembleId),
]);

export const MemberPart = sqliteTable('MemberPart', {
  id: text('id').primaryKey(),
  membershipId: text('membershipId').notNull().references(() => EnsembleMember.id, { onDelete: 'cascade' }),
  partId: text('partId').notNull().references(() => Part.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('MemberPart_membershipId_partId_unique').on(t.membershipId, t.partId),
  index('MemberPart_partId_idx').on(t.partId),
]);

export const EnsembleInvite = sqliteTable('EnsembleInvite', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  createdBy: text('createdBy').references(() => User.id, { onDelete: 'set null' }),
  expiresAt: date('expiresAt'),
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('EnsembleInvite_ensembleId_idx').on(t.ensembleId),
]);

export const Season = sqliteTable('Season', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startDate: date('startDate'),
  endDate: date('endDate'),
  isActive: integer('isActive').notNull().default(1), // 1 = true, 0 = false
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('Season_ensembleId_idx').on(t.ensembleId),
]);

export const SeasonMembership = sqliteTable('SeasonMembership', {
  id: text('id').primaryKey(),
  seasonId: text('seasonId').notNull().references(() => Season.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => User.id, { onDelete: 'cascade' }),
  joinedAt: date('joinedAt').notNull().default(NOW),
}, (t) => [
  uniqueIndex('SeasonMembership_seasonId_userId_unique').on(t.seasonId, t.userId),
  index('SeasonMembership_userId_idx').on(t.userId),
]);

export const Group = sqliteTable('Group', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').notNull().default('info'), // Bulma color classes: primary, link, info, success, warning, danger
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('Group_ensembleId_idx').on(t.ensembleId),
]);

export const GroupMembership = sqliteTable('GroupMembership', {
  id: text('id').primaryKey(),
  groupId: text('groupId').notNull().references(() => Group.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => User.id, { onDelete: 'cascade' }),
  role: text('role'), // e.g. 'lead', null for regular member
  addedAt: date('addedAt').notNull().default(NOW),
}, (t) => [
  uniqueIndex('GroupMembership_groupId_userId_unique').on(t.groupId, t.userId),
  index('GroupMembership_userId_idx').on(t.userId),
]);

export const Event = sqliteTable('Event', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  seasonId: text('seasonId').notNull().references(() => Season.id, { onDelete: 'no action' }),
  category: text('category', { enum: ['rehearsal', 'performance', 'social', 'sectional'] }).notNull().default('rehearsal'),
  title: text('title').notNull(),
  description: text('description'),
  scheduledAt: date('scheduledAt').notNull(),
  durationMinutes: integer('durationMinutes').notNull().default(90),
  location: text('location'),
  checkInCode: text('checkInCode').notNull().unique(),
  groupId: text('groupId').references(() => Group.id, { onDelete: 'set null' }),
  rsvpEnabled: integer('rsvpEnabled'), // null = use category default, 0 = disabled, 1 = enabled
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('Event_ensembleId_idx').on(t.ensembleId),
  index('Event_seasonId_idx').on(t.seasonId),
  index('Event_groupId_idx').on(t.groupId),
]);

export const Attendance = sqliteTable('Attendance', {
  id: text('id').primaryKey(),
  eventId: text('eventId').notNull().references(() => Event.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => User.id, { onDelete: 'cascade' }),
  checkedInAt: date('checkedInAt').notNull().default(NOW),
  checkedInMethod: text('checkedInMethod').notNull(), // 'qr', 'manual', 'admin'
}, (t) => [
  uniqueIndex('Attendance_eventId_userId_unique').on(t.eventId, t.userId),
  index('Attendance_userId_idx').on(t.userId),
]);

export const EventRsvp = sqliteTable('EventRsvp', {
  id: text('id').primaryKey(),
  eventId: text('eventId').notNull().references(() => Event.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => User.id, { onDelete: 'cascade' }),
  response: text('response').notNull(), // 'yes' | 'no'
  respondedAt: date('respondedAt').notNull().default(NOW),
}, (t) => [
  uniqueIndex('EventRsvp_eventId_userId_unique').on(t.eventId, t.userId),
  index('EventRsvp_userId_idx').on(t.userId),
]);

export const Announcement = sqliteTable('Announcement', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdBy: text('createdBy').references(() => User.id, { onDelete: 'set null' }),
  createdAt: date('createdAt').notNull().default(NOW),
  updatedAt: date('updatedAt').notNull().default(NOW),
}, (t) => [
  index('Announcement_ensembleId_idx').on(t.ensembleId),
]);

export const Song = sqliteTable('Song', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  composer: text('composer'),
  arranger: text('arranger'),
  runTime: integer('runTime'), // Runtime in seconds
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('Song_ensembleId_idx').on(t.ensembleId),
]);

export const SongPart = sqliteTable('SongPart', {
  id: text('id').primaryKey(),
  songId: text('songId').notNull().references(() => Song.id, { onDelete: 'cascade' }),
  partId: text('partId').notNull().references(() => Part.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('SongPart_songId_partId_unique').on(t.songId, t.partId),
  index('SongPart_partId_idx').on(t.partId),
]);

export const SeasonSong = sqliteTable('SeasonSong', {
  id: text('id').primaryKey(),
  seasonId: text('seasonId').notNull().references(() => Season.id, { onDelete: 'cascade' }),
  songId: text('songId').notNull().references(() => Song.id, { onDelete: 'cascade' }),
  addedAt: date('addedAt').notNull().default(NOW),
}, (t) => [
  uniqueIndex('SeasonSong_seasonId_songId_unique').on(t.seasonId, t.songId),
  index('SeasonSong_songId_idx').on(t.songId),
]);

export const SongFile = sqliteTable('SongFile', {
  id: text('id').primaryKey(),
  songId: text('songId').notNull().references(() => Song.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  category: text('category', { enum: ['sheet_music', 'rehearsal_track', 'other', 'link'] }).notNull().default('other'),
  uploadedBy: text('uploadedBy').references(() => User.id, { onDelete: 'set null' }),
  uploadedAt: date('uploadedAt').notNull().default(NOW),
}, (t) => [
  index('SongFile_songId_idx').on(t.songId),
]);

export const EventProgram = sqliteTable('EventProgram', {
  id: text('id').primaryKey(),
  eventId: text('eventId').notNull().references(() => Event.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['song', 'break', 'other'] }).notNull().default('song'),
  songId: text('songId').references(() => Song.id, { onDelete: 'cascade' }),
  label: text('label'), // Display name for non-song entries (breaks, announcements, etc.)
  sortOrder: integer('sortOrder').notNull().default(0),
  length: integer('length'), // Minutes allocated for this entry
  notes: text('notes'),
  addedAt: date('addedAt').notNull().default(NOW),
}, (t) => [
  index('EventProgram_eventId_idx').on(t.eventId),
  index('EventProgram_songId_idx').on(t.songId),
]);

export const EnsembleLink = sqliteTable('EnsembleLink', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('EnsembleLink_ensembleId_idx').on(t.ensembleId),
]);

export const PasswordResetToken = sqliteTable('PasswordResetToken', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => User.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: date('expiresAt').notNull(),
  usedAt: date('usedAt'),
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('PasswordResetToken_userId_idx').on(t.userId),
]);

export const EmailChangeToken = sqliteTable('EmailChangeToken', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => User.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  newEmail: text('newEmail').notNull(),
  expiresAt: date('expiresAt').notNull(),
  usedAt: date('usedAt'),
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('EmailChangeToken_userId_idx').on(t.userId),
]);

export const EmailVerificationToken = sqliteTable('EmailVerificationToken', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => User.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: date('expiresAt').notNull(),
  usedAt: date('usedAt'),
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('EmailVerificationToken_userId_idx').on(t.userId),
]);

export const SiteBanner = sqliteTable('SiteBanner', {
  id: text('id').primaryKey(),
  message: text('message').notNull(),
  color: text('color', { enum: ['primary', 'link', 'info', 'success', 'warning', 'danger'] }).notNull().default('info'),
  isActive: integer('isActive').notNull().default(1), // 1 = active, 0 = inactive
  createdAt: date('createdAt').notNull().default(NOW),
  updatedAt: date('updatedAt').notNull().default(NOW),
});

export const Task = sqliteTable('Task', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id, { onDelete: 'cascade' }),
  seasonId: text('seasonId').references(() => Season.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: date('createdAt').notNull().default(NOW),
}, (t) => [
  index('Task_ensembleId_idx').on(t.ensembleId),
  index('Task_seasonId_idx').on(t.seasonId),
]);

export const TaskCompletion = sqliteTable('TaskCompletion', {
  id: text('id').primaryKey(),
  taskId: text('taskId').notNull().references(() => Task.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => User.id, { onDelete: 'cascade' }),
  completedAt: date('completedAt').notNull().default(NOW),
  completedBy: text('completedBy').references(() => User.id, { onDelete: 'set null' }),
}, (t) => [
  uniqueIndex('TaskCompletion_taskId_userId_unique').on(t.taskId, t.userId),
  index('TaskCompletion_userId_idx').on(t.userId),
]);

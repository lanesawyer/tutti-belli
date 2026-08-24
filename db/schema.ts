import { sql } from 'drizzle-orm';
import { customType, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  arrangementReviewGroupId: text('arrangementReviewGroupId'), // Group whose members review submitted arrangements
  createdBy: text('createdBy').notNull().references(() => User.id),
  createdAt: date('createdAt').notNull().default(NOW),
});

export const EnsembleMember = sqliteTable('EnsembleMember', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  userId: text('userId').notNull().references(() => User.id),
  role: text('role').notNull().default('member'), // 'admin', 'member'
  status: text('status').notNull().default('pending'), // 'pending', 'active'
  agreedToCodeOfConductAt: date('agreedToCodeOfConductAt'),
  joinedAt: date('joinedAt').notNull().default(NOW),
});

export const Part = sqliteTable('Part', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  name: text('name').notNull(),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: date('createdAt').notNull().default(NOW),
});

export const MemberPart = sqliteTable('MemberPart', {
  id: text('id').primaryKey(),
  membershipId: text('membershipId').notNull().references(() => EnsembleMember.id),
  partId: text('partId').notNull().references(() => Part.id),
});

export const EnsembleInvite = sqliteTable('EnsembleInvite', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  code: text('code').notNull().unique(),
  createdBy: text('createdBy').notNull().references(() => User.id),
  expiresAt: date('expiresAt'),
  createdAt: date('createdAt').notNull().default(NOW),
});

export const Season = sqliteTable('Season', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  name: text('name').notNull(),
  startDate: date('startDate'),
  endDate: date('endDate'),
  isActive: integer('isActive').notNull().default(1), // 1 = true, 0 = false
  createdAt: date('createdAt').notNull().default(NOW),
});

export const SeasonMembership = sqliteTable('SeasonMembership', {
  id: text('id').primaryKey(),
  seasonId: text('seasonId').notNull().references(() => Season.id),
  userId: text('userId').notNull().references(() => User.id),
  joinedAt: date('joinedAt').notNull().default(NOW),
});

export const Group = sqliteTable('Group', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').notNull().default('info'), // Bulma color classes: primary, link, info, success, warning, danger
  createdAt: date('createdAt').notNull().default(NOW),
});

export const GroupMembership = sqliteTable('GroupMembership', {
  id: text('id').primaryKey(),
  groupId: text('groupId').notNull().references(() => Group.id),
  userId: text('userId').notNull().references(() => User.id),
  role: text('role'), // e.g. 'lead', null for regular member
  addedAt: date('addedAt').notNull().default(NOW),
});

export const Event = sqliteTable('Event', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  seasonId: text('seasonId').notNull().references(() => Season.id),
  category: text('category', { enum: ['rehearsal', 'performance', 'social', 'sectional'] }).notNull().default('rehearsal'),
  title: text('title').notNull(),
  description: text('description'),
  scheduledAt: date('scheduledAt').notNull(),
  durationMinutes: integer('durationMinutes').notNull().default(90),
  location: text('location'),
  checkInCode: text('checkInCode').notNull().unique(),
  groupId: text('groupId').references(() => Group.id),
  rsvpEnabled: integer('rsvpEnabled'), // null = use category default, 0 = disabled, 1 = enabled
  createdAt: date('createdAt').notNull().default(NOW),
});

export const Attendance = sqliteTable('Attendance', {
  id: text('id').primaryKey(),
  eventId: text('eventId').notNull().references(() => Event.id),
  userId: text('userId').notNull().references(() => User.id),
  checkedInAt: date('checkedInAt').notNull().default(NOW),
  checkedInMethod: text('checkedInMethod').notNull(), // 'qr', 'manual', 'admin'
});

export const EventRsvp = sqliteTable('EventRsvp', {
  id: text('id').primaryKey(),
  eventId: text('eventId').notNull().references(() => Event.id),
  userId: text('userId').notNull().references(() => User.id),
  response: text('response').notNull(), // 'yes' | 'no'
  respondedAt: date('respondedAt').notNull().default(NOW),
});

export const Announcement = sqliteTable('Announcement', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdBy: text('createdBy').notNull().references(() => User.id),
  createdAt: date('createdAt').notNull().default(NOW),
  updatedAt: date('updatedAt').notNull().default(NOW),
});

export const Song = sqliteTable('Song', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  name: text('name').notNull(),
  composer: text('composer'),
  arranger: text('arranger'),
  runTime: integer('runTime'), // Runtime in seconds
  createdAt: date('createdAt').notNull().default(NOW),
});

export const SongPart = sqliteTable('SongPart', {
  id: text('id').primaryKey(),
  songId: text('songId').notNull().references(() => Song.id),
  partId: text('partId').notNull().references(() => Part.id),
});

export const SeasonSong = sqliteTable('SeasonSong', {
  id: text('id').primaryKey(),
  seasonId: text('seasonId').notNull().references(() => Season.id),
  songId: text('songId').notNull().references(() => Song.id),
  addedAt: date('addedAt').notNull().default(NOW),
});

export const SongFile = sqliteTable('SongFile', {
  id: text('id').primaryKey(),
  songId: text('songId').notNull().references(() => Song.id),
  name: text('name').notNull(),
  url: text('url').notNull(),
  category: text('category', { enum: ['sheet_music', 'rehearsal_track', 'other', 'link'] }).notNull().default('other'),
  uploadedBy: text('uploadedBy').notNull().references(() => User.id),
  uploadedAt: date('uploadedAt').notNull().default(NOW),
});

export const EventProgram = sqliteTable('EventProgram', {
  id: text('id').primaryKey(),
  eventId: text('eventId').notNull().references(() => Event.id),
  type: text('type', { enum: ['song', 'break', 'other'] }).notNull().default('song'),
  songId: text('songId').references(() => Song.id),
  label: text('label'), // Display name for non-song entries (breaks, announcements, etc.)
  sortOrder: integer('sortOrder').notNull().default(0),
  length: integer('length'), // Minutes allocated for this entry
  notes: text('notes'),
  addedAt: date('addedAt').notNull().default(NOW),
});

export const EnsembleLink = sqliteTable('EnsembleLink', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  label: text('label').notNull(),
  url: text('url').notNull(),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: date('createdAt').notNull().default(NOW),
});

export const PasswordResetToken = sqliteTable('PasswordResetToken', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => User.id),
  token: text('token').notNull().unique(),
  expiresAt: date('expiresAt').notNull(),
  usedAt: date('usedAt'),
  createdAt: date('createdAt').notNull().default(NOW),
});

export const EmailChangeToken = sqliteTable('EmailChangeToken', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => User.id),
  token: text('token').notNull().unique(),
  newEmail: text('newEmail').notNull(),
  expiresAt: date('expiresAt').notNull(),
  usedAt: date('usedAt'),
  createdAt: date('createdAt').notNull().default(NOW),
});

export const EmailVerificationToken = sqliteTable('EmailVerificationToken', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => User.id),
  token: text('token').notNull().unique(),
  expiresAt: date('expiresAt').notNull(),
  usedAt: date('usedAt'),
  createdAt: date('createdAt').notNull().default(NOW),
});

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
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  seasonId: text('seasonId').references(() => Season.id),
  title: text('title').notNull(),
  description: text('description'),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: date('createdAt').notNull().default(NOW),
});

export const TaskCompletion = sqliteTable('TaskCompletion', {
  id: text('id').primaryKey(),
  taskId: text('taskId').notNull().references(() => Task.id),
  userId: text('userId').notNull().references(() => User.id),
  completedAt: date('completedAt').notNull().default(NOW),
  completedBy: text('completedBy').notNull().references(() => User.id),
});

export const Arrangement = sqliteTable('Arrangement', {
  id: text('id').primaryKey(),
  ensembleId: text('ensembleId').notNull().references(() => Ensemble.id),
  title: text('title').notNull(),
  composer: text('composer'),
  arranger: text('arranger'),
  notes: text('notes'),
  status: text('status', { enum: ['in_review', 'approved', 'declined'] }).notNull().default('in_review'),
  submittedBy: text('submittedBy').notNull().references(() => User.id),
  approvedSongId: text('approvedSongId').references(() => Song.id), // Song created when adopted into the library
  createdAt: date('createdAt').notNull().default(NOW),
});

export const ArrangementVersion = sqliteTable('ArrangementVersion', {
  id: text('id').primaryKey(),
  arrangementId: text('arrangementId').notNull().references(() => Arrangement.id),
  versionNumber: integer('versionNumber').notNull(),
  fileName: text('fileName').notNull(),
  url: text('url').notNull(),
  notes: text('notes'), // What changed in this version
  uploadedBy: text('uploadedBy').notNull().references(() => User.id),
  uploadedAt: date('uploadedAt').notNull().default(NOW),
});

export const ArrangementComment = sqliteTable('ArrangementComment', {
  id: text('id').primaryKey(),
  versionId: text('versionId').notNull().references(() => ArrangementVersion.id),
  userId: text('userId').notNull().references(() => User.id),
  content: text('content').notNull(),
  createdAt: date('createdAt').notNull().default(NOW),
});

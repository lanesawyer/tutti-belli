import { defineDb, defineTable, column, NOW } from 'astro:db';

// Better Auth core tables
const User = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    name: column.text(),
    email: column.text({ unique: true }),
    emailVerified: column.boolean({ default: false }),
    image: column.text({ optional: true }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
    // Additional fields
    role: column.text({ default: 'user' }),
    phone: column.text({ optional: true }),
    avatarUrl: column.text({ optional: true }),
  }
});

const Session = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    expiresAt: column.date(),
    token: column.text({ unique: true }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
    ipAddress: column.text({ optional: true }),
    userAgent: column.text({ optional: true }),
    userId: column.text({ references: () => User.columns.id }),
  }
});

const Account = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    accountId: column.text(),
    providerId: column.text(),
    userId: column.text({ references: () => User.columns.id }),
    accessToken: column.text({ optional: true }),
    refreshToken: column.text({ optional: true }),
    idToken: column.text({ optional: true }),
    accessTokenExpiresAt: column.date({ optional: true }),
    refreshTokenExpiresAt: column.date({ optional: true }),
    scope: column.text({ optional: true }),
    password: column.text({ optional: true }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  }
});

const Verification = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    identifier: column.text(),
    value: column.text(),
    expiresAt: column.date(),
    createdAt: column.date({ optional: true }),
    updatedAt: column.date({ optional: true }),
  }
});

const Ensemble = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    name: column.text(),
    slug: column.text({ optional: true, unique: true }),
    description: column.text({ optional: true }),
    imageUrl: column.text({ optional: true }),
    discordLink: column.text({ optional: true }),
    discordWebhookUrl: column.text({ optional: true }),
    codeOfConduct: column.text({ optional: true }),
    checkInStartMinutes: column.number({ default: 30 }),
    checkInEndMinutes: column.number({ default: 15 }),
    createdBy: column.text({ references: () => User.columns.id }),
    createdAt: column.date({ default: NOW }),
  }
});

const EnsembleMember = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    userId: column.text({ references: () => User.columns.id }),
    role: column.text({ default: 'member' }),
    status: column.text({ default: 'pending' }),
    agreedToCodeOfConductAt: column.date({ optional: true }),
    joinedAt: column.date({ default: NOW }),
  }
});

const Part = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    name: column.text(),
    sortOrder: column.number({ default: 0 }),
    createdAt: column.date({ default: NOW }),
  }
});

const MemberPart = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    membershipId: column.text({ references: () => EnsembleMember.columns.id }),
    partId: column.text({ references: () => Part.columns.id }),
  }
});

const EnsembleInvite = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    code: column.text({ unique: true }),
    createdBy: column.text({ references: () => User.columns.id }),
    expiresAt: column.date({ optional: true }),
    createdAt: column.date({ default: NOW }),
  }
});

const Season = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    name: column.text(),
    startDate: column.date({ optional: true }),
    endDate: column.date({ optional: true }),
    isActive: column.number({ default: 1 }),
    createdAt: column.date({ default: NOW }),
  }
});

const SeasonMembership = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    seasonId: column.text({ references: () => Season.columns.id }),
    userId: column.text({ references: () => User.columns.id }),
    joinedAt: column.date({ default: NOW }),
  }
});

const Event = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    seasonId: column.text({ references: () => Season.columns.id }),
    category: column.text({ enum: ['rehearsal', 'performance', 'social', 'sectional'], default: 'rehearsal' }),
    title: column.text(),
    description: column.text({ optional: true }),
    scheduledAt: column.date(),
    durationMinutes: column.number({ default: 90 }),
    location: column.text({ optional: true }),
    checkInCode: column.text({ unique: true }),
    groupId: column.text({ optional: true, references: () => Group.columns.id }),
    rsvpEnabled: column.number({ optional: true }),
    createdAt: column.date({ default: NOW }),
  }
});

const Attendance = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    eventId: column.text({ references: () => Event.columns.id }),
    userId: column.text({ references: () => User.columns.id }),
    checkedInAt: column.date({ default: NOW }),
    checkedInMethod: column.text(),
  }
});

const Announcement = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    title: column.text(),
    content: column.text(),
    createdBy: column.text({ references: () => User.columns.id }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  }
});

const Group = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    name: column.text(),
    description: column.text({ optional: true }),
    color: column.text({ default: 'info' }),
    createdAt: column.date({ default: NOW }),
  }
});

const GroupMembership = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    groupId: column.text({ references: () => Group.columns.id }),
    userId: column.text({ references: () => User.columns.id }),
    role: column.text({ optional: true }),
    addedAt: column.date({ default: NOW }),
  }
});

const Song = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    name: column.text(),
    composer: column.text({ optional: true }),
    arranger: column.text({ optional: true }),
    runTime: column.number({ optional: true }),
    createdAt: column.date({ default: NOW }),
  }
});

const SongPart = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    songId: column.text({ references: () => Song.columns.id }),
    partId: column.text({ references: () => Part.columns.id }),
  }
});

const SeasonSong = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    seasonId: column.text({ references: () => Season.columns.id }),
    songId: column.text({ references: () => Song.columns.id }),
    addedAt: column.date({ default: NOW }),
  }
});

const SongFile = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    songId: column.text({ references: () => Song.columns.id }),
    name: column.text(),
    url: column.text(),
    category: column.text({ enum: ['sheet_music', 'rehearsal_track', 'other', 'link'], default: 'other' }),
    uploadedBy: column.text({ references: () => User.columns.id }),
    uploadedAt: column.date({ default: NOW }),
  }
});

const EventProgram = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    eventId: column.text({ references: () => Event.columns.id }),
    type: column.text({ enum: ['song', 'break', 'other'], default: 'song' }),
    songId: column.text({ optional: true, references: () => Song.columns.id }),
    label: column.text({ optional: true }),
    sortOrder: column.number({ default: 0 }),
    length: column.number({ optional: true }),
    notes: column.text({ optional: true }),
    addedAt: column.date({ default: NOW }),
  }
});

const EnsembleLink = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    label: column.text(),
    url: column.text(),
    sortOrder: column.number({ default: 0 }),
    createdAt: column.date({ default: NOW }),
  }
});

const SiteBanner = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    message: column.text(),
    color: column.text({ enum: ['primary', 'link', 'info', 'success', 'warning', 'danger'], default: 'info' }),
    isActive: column.number({ default: 1 }),
    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  }
});

const EventRsvp = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    eventId: column.text({ references: () => Event.columns.id }),
    userId: column.text({ references: () => User.columns.id }),
    response: column.text(),
    respondedAt: column.date({ default: NOW }),
  }
});

const Task = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    seasonId: column.text({ optional: true, references: () => Season.columns.id }),
    title: column.text(),
    description: column.text({ optional: true }),
    sortOrder: column.number({ default: 0 }),
    createdAt: column.date({ default: NOW }),
  }
});

const TaskCompletion = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    taskId: column.text({ references: () => Task.columns.id }),
    userId: column.text({ references: () => User.columns.id }),
    completedAt: column.date({ default: NOW }),
    completedBy: column.text({ references: () => User.columns.id }),
  }
});

export default defineDb({
  tables: {
    User, Session, Account, Verification,
    Ensemble, EnsembleMember, Part, MemberPart, EnsembleInvite,
    Season, SeasonMembership, Event, Attendance, EventRsvp,
    Announcement, Group, GroupMembership,
    Song, SongPart, SeasonSong, SongFile, EventProgram,
    EnsembleLink, SiteBanner, Task, TaskCompletion,
  }
});

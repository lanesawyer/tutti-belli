import { defineDb, defineTable, column, NOW } from 'astro:db';

const User = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    email: column.text({ unique: true }),
    passwordHash: column.text(),
    name: column.text(),    avatarUrl: column.text({ optional: true }),    role: column.text({ enum: ['admin', 'ensemble_admin', 'user'], default: 'user' }),
    createdAt: column.date({ default: NOW }),
  }
});

const Ensemble = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    name: column.text(),
    description: column.text({ optional: true }),
    imageUrl: column.text({ optional: true }),
    discordLink: column.text({ optional: true }),
    codeOfConduct: column.text({ optional: true }),
    checkInStartMinutes: column.number({ default: 30 }), // Minutes before rehearsal check-in opens
    checkInEndMinutes: column.number({ default: 15 }), // Minutes after rehearsal start check-in closes
    createdBy: column.text({ references: () => User.columns.id }),
    createdAt: column.date({ default: NOW }),
  }
});

const EnsembleMember = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    userId: column.text({ references: () => User.columns.id }),
    role: column.text({ default: 'member' }), // 'admin', 'member'
    status: column.text({ default: 'pending' }), // 'pending', 'active'
    partId: column.text({ optional: true, references: () => Part.columns.id }),
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
    isActive: column.number({ default: 1 }), // 1 = true, 0 = false
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

const Rehearsal = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    seasonId: column.text({ references: () => Season.columns.id }),
    title: column.text(),
    description: column.text({ optional: true }),
    scheduledAt: column.date(),
    durationMinutes: column.number({ default: 90 }), // Default 90 minute rehearsal
    location: column.text({ optional: true }),
    checkInCode: column.text({ unique: true }),
    createdAt: column.date({ default: NOW }),
  }
});

const Attendance = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    rehearsalId: column.text({ references: () => Rehearsal.columns.id }),
    userId: column.text({ references: () => User.columns.id }),
    checkedInAt: column.date({ default: NOW }),
    checkedInMethod: column.text(), // 'qr', 'manual', 'admin'
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
    color: column.text({ default: 'info' }), // Bulma color classes: primary, link, info, success, warning, danger
    createdAt: column.date({ default: NOW }),
  }
});

const GroupMembership = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    groupId: column.text({ references: () => Group.columns.id }),
    userId: column.text({ references: () => User.columns.id }),
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
    runTime: column.number({ optional: true }), // Runtime in seconds
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
    category: column.text({ enum: ['sheet_music', 'rehearsal_track', 'other'], default: 'other' }),
    uploadedBy: column.text({ references: () => User.columns.id }),
    uploadedAt: column.date({ default: NOW }),
  }
});

const PasswordResetToken = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    userId: column.text({ references: () => User.columns.id }),
    token: column.text({ unique: true }),
    expiresAt: column.date(),
    usedAt: column.date({ optional: true }),
    createdAt: column.date({ default: NOW }),
  }
});

export default defineDb({
  tables: { User, Ensemble, EnsembleMember, Part, EnsembleInvite, Season, SeasonMembership, Rehearsal, Attendance, Announcement, Group, GroupMembership, Song, SongPart, SeasonSong, SongFile, PasswordResetToken }
});

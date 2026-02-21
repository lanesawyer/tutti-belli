import { defineDb, defineTable, column, NOW } from 'astro:db';

const User = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    email: column.text({ unique: true }),
    passwordHash: column.text(),
    name: column.text(),
    role: column.text({ default: 'user' }), // 'admin', 'user'
    createdAt: column.date({ default: NOW }),
  }
});

const Ensemble = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    name: column.text(),
    description: column.text({ optional: true }),
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
    partId: column.text({ optional: true, references: () => Part.columns.id }),
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

const Rehearsal = defineTable({
  columns: {
    id: column.text({ primaryKey: true }),
    ensembleId: column.text({ references: () => Ensemble.columns.id }),
    title: column.text(),
    description: column.text({ optional: true }),
    scheduledAt: column.date(),
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

export default defineDb({
  tables: { User, Ensemble, EnsembleMember, Part, EnsembleInvite, Rehearsal, Attendance }
});

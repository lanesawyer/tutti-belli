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
    joinedAt: column.date({ default: NOW }),
  }
});

export default defineDb({
  tables: { User, Ensemble, EnsembleMember }
});

/**
 * Integration tests for task lib functions.
 */
import { describe, it, expect } from 'vitest';
import { db, Task, TaskCompletion, eq } from 'astro:db';
import {
  getEnsembleTasks,
  getTasksWithCompletionsForUser,
  getUserTasksAcrossEnsembles,
  createTask,
  editTask,
  deleteTask,
  markTaskComplete,
  markTaskIncomplete,
} from '../../src/lib/tasks.ts';
import {
  createUser,
  createEnsemble,
  createMembership,
  createSeason,
  createTask as createTaskFixture,
  createTaskCompletion,
} from './fixtures.ts';

describe('getEnsembleTasks', () => {
  it('returns tasks ordered by sortOrder then createdAt', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    await createTaskFixture(ensemble!.id, { title: 'Second', sortOrder: 2 });
    await createTaskFixture(ensemble!.id, { title: 'First', sortOrder: 1 });

    const tasks = await getEnsembleTasks(ensemble!.id);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('First');
    expect(tasks[1].title).toBe('Second');
  });

  it('returns empty array when no tasks', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    const tasks = await getEnsembleTasks(ensemble!.id);
    expect(tasks).toHaveLength(0);
  });

  it('filters by seasonId when provided', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    await createTaskFixture(ensemble!.id, { title: 'Season Task', seasonId: season!.id });
    await createTaskFixture(ensemble!.id, { title: 'Ensemble Task' });

    const seasonTasks = await getEnsembleTasks(ensemble!.id, season!.id);
    expect(seasonTasks).toHaveLength(1);
    expect(seasonTasks[0].title).toBe('Season Task');
  });
});

describe('getTasksWithCompletionsForUser', () => {
  it('returns tasks with completed: false when no completions exist', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    await createTaskFixture(ensemble!.id, { title: 'Pay dues' });

    const result = await getTasksWithCompletionsForUser(ensemble!.id, user!.id);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Pay dues');
    expect(result[0].completed).toBe(false);
  });

  it('returns tasks with completed: true when a completion row exists', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const task = await createTaskFixture(ensemble!.id, { title: 'Sign waiver' });
    await createTaskCompletion(task!.id, user!.id, admin!.id);

    const result = await getTasksWithCompletionsForUser(ensemble!.id, user!.id);
    expect(result).toHaveLength(1);
    expect(result[0].completed).toBe(true);
  });

  it('filters to only tasks in the given season', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    await createTaskFixture(ensemble!.id, { title: 'Season Task', seasonId: season!.id });
    await createTaskFixture(ensemble!.id, { title: 'Ensemble Task' });

    const result = await getTasksWithCompletionsForUser(ensemble!.id, user!.id, season!.id);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Season Task');
  });

  it('only marks completion for the specific user, not others', async () => {
    const admin = await createUser({ role: 'admin' });
    const user1 = await createUser();
    const user2 = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const task = await createTaskFixture(ensemble!.id);
    await createTaskCompletion(task!.id, user1!.id, admin!.id);

    const result1 = await getTasksWithCompletionsForUser(ensemble!.id, user1!.id);
    const result2 = await getTasksWithCompletionsForUser(ensemble!.id, user2!.id);

    expect(result1[0].completed).toBe(true);
    expect(result2[0].completed).toBe(false);
  });
});

describe('getUserTasksAcrossEnsembles', () => {
  it('returns tasks for all active ensembles with active seasons', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ens1 = await createEnsemble(admin!.id, { name: 'Ensemble A' });
    const ens2 = await createEnsemble(admin!.id, { name: 'Ensemble B' });
    await createMembership(ens1!.id, user!.id, { status: 'active' });
    await createMembership(ens2!.id, user!.id, { status: 'active' });
    const s1 = await createSeason(ens1!.id, { isActive: 1 });
    const s2 = await createSeason(ens2!.id, { isActive: 1 });
    await createTaskFixture(ens1!.id, { title: 'Task A', seasonId: s1!.id });
    await createTaskFixture(ens2!.id, { title: 'Task B', seasonId: s2!.id });

    const result = await getUserTasksAcrossEnsembles(user!.id);
    expect(result).toHaveLength(2);
    const names = result.map((r) => r.ensembleName).sort();
    expect(names).toEqual(['Ensemble A', 'Ensemble B']);
  });

  it('excludes ensembles with no tasks in the active season', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    await createMembership(ensemble!.id, user!.id, { status: 'active' });
    await createSeason(ensemble!.id, { isActive: 1 });

    const result = await getUserTasksAcrossEnsembles(user!.id);
    expect(result).toHaveLength(0);
  });

  it('excludes inactive seasons', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    await createMembership(ensemble!.id, user!.id, { status: 'active' });
    const season = await createSeason(ensemble!.id, { isActive: 0 });
    await createTaskFixture(ensemble!.id, { title: 'Old task', seasonId: season!.id });

    const result = await getUserTasksAcrossEnsembles(user!.id);
    expect(result).toHaveLength(0);
  });

  it('excludes ensembles where the user is pending', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    await createMembership(ensemble!.id, user!.id, { status: 'pending' });
    const season = await createSeason(ensemble!.id, { isActive: 1 });
    await createTaskFixture(ensemble!.id, { title: 'Task', seasonId: season!.id });

    const result = await getUserTasksAcrossEnsembles(user!.id);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when user has no memberships', async () => {
    const user = await createUser();
    const result = await getUserTasksAcrossEnsembles(user!.id);
    expect(result).toHaveLength(0);
  });
});

describe('markTaskComplete', () => {
  it('creates a completion row', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const task = await createTaskFixture(ensemble!.id);

    await markTaskComplete(task!.id, user!.id, admin!.id);

    const completions = await db
      .select()
      .from(TaskCompletion)
      .where(eq(TaskCompletion.taskId, task!.id))
      .all();
    expect(completions).toHaveLength(1);
    expect(completions[0].userId).toBe(user!.id);
    expect(completions[0].completedBy).toBe(admin!.id);
  });

  it('is idempotent — calling twice creates only one row', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const task = await createTaskFixture(ensemble!.id);

    await markTaskComplete(task!.id, user!.id, admin!.id);
    await markTaskComplete(task!.id, user!.id, admin!.id);

    const completions = await db
      .select()
      .from(TaskCompletion)
      .where(eq(TaskCompletion.taskId, task!.id))
      .all();
    expect(completions).toHaveLength(1);
  });
});

describe('markTaskIncomplete', () => {
  it('removes the completion row', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const task = await createTaskFixture(ensemble!.id);
    await createTaskCompletion(task!.id, user!.id, admin!.id);

    await markTaskIncomplete(task!.id, user!.id);

    const completions = await db
      .select()
      .from(TaskCompletion)
      .where(eq(TaskCompletion.taskId, task!.id))
      .all();
    expect(completions).toHaveLength(0);
  });

  it('is a no-op when there is no completion row', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const task = await createTaskFixture(ensemble!.id);

    await expect(markTaskIncomplete(task!.id, user!.id)).resolves.not.toThrow();
  });
});

describe('deleteTask', () => {
  it('removes the task and its completion records', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const task = await createTaskFixture(ensemble!.id);
    await createTaskCompletion(task!.id, user!.id, admin!.id);

    await deleteTask(task!.id);

    expect(
      await db.select().from(Task).where(eq(Task.id, task!.id)).get()
    ).toBeUndefined();
    expect(
      await db
        .select()
        .from(TaskCompletion)
        .where(eq(TaskCompletion.taskId, task!.id))
        .all()
    ).toHaveLength(0);
  });
});

describe('createTask / editTask', () => {
  it('creates a task with correct fields', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    await createTask(ensemble!.id, 'Pay dues', 'Annual membership fee', 1);

    const tasks = await getEnsembleTasks(ensemble!.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Pay dues');
    expect(tasks[0].description).toBe('Annual membership fee');
    expect(tasks[0].sortOrder).toBe(1);
  });

  it('edits a task title and description', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const task = await createTaskFixture(ensemble!.id, { title: 'Old Title' });

    await editTask(task!.id, 'New Title', 'Updated description', 5);

    const tasks = await getEnsembleTasks(ensemble!.id);
    expect(tasks[0].title).toBe('New Title');
    expect(tasks[0].description).toBe('Updated description');
    expect(tasks[0].sortOrder).toBe(5);
  });
});

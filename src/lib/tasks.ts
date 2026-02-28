import {
  db,
  eq,
  and,
  asc,
  isNull,
  inArray,
  EnsembleMember,
  Ensemble,
  Season,
  Task,
  TaskCompletion,
} from 'astro:db';

// ── Queries ────────────────────────────────────────────────────────────────────

/** All tasks for an ensemble, optionally filtered to a specific season. */
/**
 * seasonId = a string  → only tasks for that season
 * seasonId = null      → only ensemble-wide tasks (seasonId IS NULL)
 * seasonId = undefined → all tasks for the ensemble (no season filter)
 */
export async function getEnsembleTasks(ensembleId: string, seasonId?: string | null) {
  const filter =
    seasonId !== undefined
      ? seasonId !== null
        ? and(eq(Task.ensembleId, ensembleId), eq(Task.seasonId, seasonId))
        : and(eq(Task.ensembleId, ensembleId), isNull(Task.seasonId))
      : eq(Task.ensembleId, ensembleId);
  return db
    .select()
    .from(Task)
    .where(filter)
    .orderBy(asc(Task.sortOrder), asc(Task.createdAt))
    .all();
}

export async function getTaskCompletionsForUser(ensembleId: string, userId: string, seasonId?: string | null) {
  const filter =
    seasonId !== undefined
      ? seasonId !== null
        ? and(eq(Task.ensembleId, ensembleId), eq(Task.seasonId, seasonId), eq(TaskCompletion.userId, userId))
        : and(eq(Task.ensembleId, ensembleId), isNull(Task.seasonId), eq(TaskCompletion.userId, userId))
      : and(eq(Task.ensembleId, ensembleId), eq(TaskCompletion.userId, userId));
  return db
    .select({
      taskId: TaskCompletion.taskId,
      completedAt: TaskCompletion.completedAt,
    })
    .from(TaskCompletion)
    .innerJoin(Task, eq(TaskCompletion.taskId, Task.id))
    .where(filter)
    .all();
}

export async function getTaskCompletionsForEnsemble(ensembleId: string, seasonId?: string | null) {
  const filter = seasonId
    ? and(eq(Task.ensembleId, ensembleId), eq(Task.seasonId, seasonId))
    : eq(Task.ensembleId, ensembleId);
  return db
    .select({
      taskId: TaskCompletion.taskId,
      userId: TaskCompletion.userId,
      completedAt: TaskCompletion.completedAt,
      completedBy: TaskCompletion.completedBy,
    })
    .from(TaskCompletion)
    .innerJoin(Task, eq(TaskCompletion.taskId, Task.id))
    .where(filter)
    .all();
}

export async function getTasksWithCompletionsForUser(ensembleId: string, userId: string, seasonId?: string | null) {
  const [tasks, completions] = await Promise.all([
    getEnsembleTasks(ensembleId, seasonId),
    getTaskCompletionsForUser(ensembleId, userId, seasonId),
  ]);
  const completedTaskIds = new Set(completions.map((c) => c.taskId));
  return tasks.map((task) => ({ ...task, completed: completedTaskIds.has(task.id) }));
}

export type TaskWithCompletion = Awaited<ReturnType<typeof getTasksWithCompletionsForUser>>[number];
export type EnsembleTaskGroup = {
  ensembleId: string;
  ensembleName: string;
  seasonId: string | null;
  seasonName: string | null;
  tasks: TaskWithCompletion[];
};

export async function getUserTasksAcrossEnsembles(userId: string): Promise<EnsembleTaskGroup[]> {
  const memberships = await db
    .select({
      ensembleId: Ensemble.id,
      ensembleName: Ensemble.name,
    })
    .from(EnsembleMember)
    .innerJoin(Ensemble, eq(EnsembleMember.ensembleId, Ensemble.id))
    .where(and(eq(EnsembleMember.userId, userId), eq(EnsembleMember.status, 'active')))
    .all();

  if (memberships.length === 0) return [];

  const ensembleIds = memberships.map((m) => m.ensembleId);

  // Get the active seasons for labelling purposes
  const activeSeasons = await db
    .select()
    .from(Season)
    .where(and(inArray(Season.ensembleId, ensembleIds), eq(Season.isActive, 1)))
    .all();

  const seasonByEnsemble = new Map(activeSeasons.map((s) => [s.ensembleId, s]));

  const results = await Promise.all(
    memberships.map(async (membership) => {
      const activeSeason = seasonByEnsemble.get(membership.ensembleId);
      // If there's an active season, fetch season-scoped tasks.
      // Otherwise fetch only ensemble-wide tasks (null = seasonId IS NULL).
      const tasks = await getTasksWithCompletionsForUser(
        membership.ensembleId,
        userId,
        activeSeason ? activeSeason.id : null
      );
      if (tasks.length === 0) return null;
      return {
        ensembleId: membership.ensembleId,
        ensembleName: membership.ensembleName,
        seasonId: activeSeason?.id ?? null,
        seasonName: activeSeason?.name ?? null,
        tasks,
      };
    })
  );

  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}

// ── Auth helper ────────────────────────────────────────────────────────────────

export async function getTaskEnsembleId(taskId: string): Promise<string | null> {
  const row = await db
    .select({ ensembleId: Task.ensembleId })
    .from(Task)
    .where(eq(Task.id, taskId))
    .get();
  return row?.ensembleId ?? null;
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export async function createTask(
  ensembleId: string,
  title: string,
  description?: string,
  sortOrder = 0,
  seasonId?: string | null
) {
  await db.insert(Task).values({
    id: crypto.randomUUID(),
    ensembleId,
    seasonId: seasonId ?? null,
    title: title.trim(),
    description: description?.trim() || null,
    sortOrder,
  });
}

export async function editTask(
  taskId: string,
  title: string,
  description?: string,
  sortOrder = 0
) {
  await db
    .update(Task)
    .set({ title: title.trim(), description: description?.trim() || null, sortOrder })
    .where(eq(Task.id, taskId));
}

export async function deleteTask(taskId: string) {
  await db.delete(TaskCompletion).where(eq(TaskCompletion.taskId, taskId));
  await db.delete(Task).where(eq(Task.id, taskId));
}

export async function markTaskComplete(taskId: string, userId: string, completedBy: string) {
  const existing = await db
    .select()
    .from(TaskCompletion)
    .where(and(eq(TaskCompletion.taskId, taskId), eq(TaskCompletion.userId, userId)))
    .get();
  if (existing) return;
  await db.insert(TaskCompletion).values({
    id: crypto.randomUUID(),
    taskId,
    userId,
    completedBy,
  });
}

export async function markTaskIncomplete(taskId: string, userId: string) {
  await db
    .delete(TaskCompletion)
    .where(and(eq(TaskCompletion.taskId, taskId), eq(TaskCompletion.userId, userId)));
}

import { db, Ensemble, User } from 'astro:db';

export async function getAllEnsembles() {
  return await db.select().from(Ensemble).all();
}

export async function getAllUsers() {
  return await db.select().from(User).all();
}

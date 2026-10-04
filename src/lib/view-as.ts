import { db, eq, User } from '@db';
import { isSiteAdmin } from './permissions';
import { readViewAsToken } from './session';

export const VIEW_AS_COOKIE = 'view_as';

/** Site admins can view the site as any other user who isn't a site admin. */
export function canViewAs(admin: { id: string; role: string }, target: { id: string; role: string }): boolean {
  return isSiteAdmin(admin) && !isSiteAdmin(target) && admin.id !== target.id;
}

/**
 * The user a view-as cookie points at, if the cookie is valid for this signed-in site admin.
 * Anything else (expired, forged, another admin's cookie, a site admin as the target) returns null.
 */
export async function resolveViewAs(token: string, realUser: { id: string; role: string }) {
  const payload = readViewAsToken(token);
  if (!payload || payload.adminId !== realUser.id) return null;
  const target = (await db.select().from(User).where(eq(User.id, payload.targetId)).get()) ?? null;
  return target && canViewAs(realUser, target) ? target : null;
}

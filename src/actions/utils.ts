import { ActionError } from "astro:actions";
import { z } from "astro/zod";
import { newPasswordError } from "@lib/auth";
import { getEnsembleMembership } from "@lib/ensemble";
import { canManageEnsemble } from "@lib/permissions";
import {
  isInEnsemble,
  isUserInEnsemble,
  partsInEnsemble,
  seasonsInEnsemble,
  type OwnedKind,
} from "@lib/ownership";

/** A password someone is choosing now. Not for login: older accounts have shorter passwords. */
export const newPassword = z.string().superRefine((password, ctx) => {
  const message = newPasswordError(password);
  if (message) ctx.addIssue({ code: "custom", message });
});

export function assertSiteAdmin(user: { role: string } | undefined | null) {
  if (!user || user.role !== "admin") {
    throw new ActionError({ code: "FORBIDDEN" });
  }
}

export async function assertEnsembleAdmin(ensembleId: string, user: { id: string; role: string }) {
  const membership = await getEnsembleMembership(ensembleId, user.id);

  if (!canManageEnsemble(user, membership)) {
    throw new ActionError({ code: "FORBIDDEN" });
  }
}

export async function assertEnsembleMember(ensembleId: string, user: { id: string; role: string }) {
  const membership = await getEnsembleMembership(ensembleId, user.id);

  if (membership?.status !== "active") {
    throw new ActionError({ code: "FORBIDDEN" });
  }

  return membership;
}

/**
 * Actions check permissions against the ensembleId in the form, so every other ID in the
 * form must be checked against that same ensemble. NOT_FOUND rather than FORBIDDEN so the
 * response doesn't confirm that a record in another ensemble exists.
 */
export async function assertInEnsemble(kind: OwnedKind, id: string, ensembleId: string) {
  if (!(await isInEnsemble(kind, id, ensembleId))) {
    throw new ActionError({ code: "NOT_FOUND" });
  }
}

export async function assertUserInEnsemble(userId: string, ensembleId: string) {
  if (!(await isUserInEnsemble(userId, ensembleId))) {
    throw new ActionError({ code: "NOT_FOUND" });
  }
}

export async function assertPartsInEnsemble(partIds: string[], ensembleId: string) {
  if (!(await partsInEnsemble(partIds, ensembleId))) {
    throw new ActionError({ code: "NOT_FOUND" });
  }
}

export async function assertSeasonsInEnsemble(seasonIds: string[], ensembleId: string) {
  if (!(await seasonsInEnsemble(seasonIds, ensembleId))) {
    throw new ActionError({ code: "NOT_FOUND" });
  }
}

import type { APIRoute } from 'astro';
import {
  getEnsembleBySlugOrId,
  getEnsembleAccess,
  getEnsembleMembersWithUsers,
  getEnsembleParts,
  getMemberPartAssignments,
} from '@lib/ensemble';
import { toCSV, csvResponse, type CsvColumn } from '@lib/csv';

type MemberRow = Awaited<ReturnType<typeof getEnsembleMembersWithUsers>>[number] & {
  parts: string;
};

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const ensemble = await getEnsembleBySlugOrId(params.id!);
  if (!ensemble) return new Response('Not found', { status: 404 });

  const access = await getEnsembleAccess(user, ensemble.id);
  if (!access?.isAdmin) return new Response('Forbidden', { status: 403 });

  const members = await getEnsembleMembersWithUsers(ensemble.id);
  const allParts = await getEnsembleParts(ensemble.id);
  const partById = new Map(allParts.map((p) => [p.id, p.name]));

  const memberPartRows = await getMemberPartAssignments(members.map((m) => m.membershipId));
  const partsByMembership = new Map<string, string[]>();
  for (const mp of memberPartRows) {
    const partName = partById.get(mp.partId);
    if (!partName) continue;
    if (!partsByMembership.has(mp.membershipId)) partsByMembership.set(mp.membershipId, []);
    partsByMembership.get(mp.membershipId)!.push(partName);
  }

  const rows: MemberRow[] = members.map((m) => ({
    ...m,
    parts: (partsByMembership.get(m.membershipId) ?? []).join('; '),
  }));

  const columns: CsvColumn<MemberRow>[] = [
    { header: 'Name', value: (r) => r.name },
    { header: 'Email', value: (r) => r.email },
    { header: 'Role', value: (r) => r.role },
    { header: 'Parts', value: (r) => r.parts },
    { header: 'Joined', value: (r) => new Date(r.joinedAt).toISOString().slice(0, 10) },
  ];

  const csv = toCSV(rows, columns);
  const slug = ensemble.slug ?? ensemble.id;
  return csvResponse(csv, `${slug}-members.csv`);
};

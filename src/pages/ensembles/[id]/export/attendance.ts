import type { APIRoute } from 'astro';
import { getEnsembleBySlugOrId, getEnsembleAccess } from '@lib/ensemble';
import { getMemberAttendanceStats, type MemberAttendanceStat } from '@lib/member-attendance';
import { toCSV, csvResponse, type CsvColumn } from '@lib/csv';

export const GET: APIRoute = async ({ params, locals, url }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const ensemble = await getEnsembleBySlugOrId(params.id!);
  if (!ensemble) return new Response('Not found', { status: 404 });

  const access = await getEnsembleAccess(user, ensemble.id);
  if (!access?.isAdmin) return new Response('Forbidden', { status: 403 });

  const seasonId = url.searchParams.get('seasonId') ?? undefined;
  const stats = await getMemberAttendanceStats(ensemble.id, seasonId);

  const columns: CsvColumn<MemberAttendanceStat>[] = [
    { header: 'Name', value: (r) => r.name },
    { header: 'Email', value: (r) => r.email },
    { header: 'Role', value: (r) => r.role },
    { header: 'Attended', value: (r) => r.attended },
    { header: 'Total Events', value: (r) => r.total },
    { header: 'Attendance %', value: (r) => r.pct },
  ];

  const csv = toCSV(stats, columns);
  const slug = ensemble.slug ?? ensemble.id;
  const suffix = seasonId ? `-season-${seasonId}` : '';
  return csvResponse(csv, `${slug}-attendance${suffix}.csv`);
};

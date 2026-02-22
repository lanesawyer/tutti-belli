export type AdminTool = {
  href: (ensembleId: string) => string;
  icon: string;
  label: string;
};

export const ensembleAdminTools: AdminTool[] = [
  { href: (id) => `/ensembles/${id}/edit`, icon: 'fa-edit', label: 'Settings' },
  { href: (id) => `/ensembles/${id}/members`, icon: 'fa-users', label: 'Members' },
  { href: (id) => `/ensembles/${id}/songs`, icon: 'fa-music', label: 'Songs' },
  { href: (id) => `/ensembles/${id}/events`, icon: 'fa-calendar-check', label: 'Events' },
  { href: (id) => `/ensembles/${id}/announcements`, icon: 'fa-bullhorn', label: 'Announcements' },
  { href: (id) => `/ensembles/${id}/parts`, icon: 'fa-list', label: 'Parts' },
  { href: (id) => `/ensembles/${id}/seasons`, icon: 'fa-calendar-alt', label: 'Seasons' },
  { href: (id) => `/ensembles/${id}/groups`, icon: 'fa-users-cog', label: 'Groups' },
];

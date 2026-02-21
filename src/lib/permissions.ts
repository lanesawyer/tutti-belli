/**
 * Permission utility functions for checking user roles and access levels
 */

type User = {
  role: string;
  [key: string]: any;
};

type Membership = {
  role: string;
  [key: string]: any;
} | null | undefined;

/**
 * Check if a user is a site administrator
 */
export function isSiteAdmin(user: User | null | undefined): boolean {
  return user?.role === 'admin';
}

/**
 * Check if a user is an ensemble administrator
 */
export function isEnsembleAdmin(membership: Membership): boolean {
  return membership?.role === 'admin';
}

/**
 * Check if a user can manage an ensemble (is either site admin or ensemble admin)
 */
export function canManageEnsemble(user: User | null | undefined, membership: Membership): boolean {
  return isSiteAdmin(user) || isEnsembleAdmin(membership);
}

/**
 * Check if a user is an ensemble administrator (for backwards compatibility)
 * @deprecated Use isEnsembleAdmin instead
 */
export function isEnsembleAdminRole(role: string | undefined): boolean {
  return role === 'admin';
}

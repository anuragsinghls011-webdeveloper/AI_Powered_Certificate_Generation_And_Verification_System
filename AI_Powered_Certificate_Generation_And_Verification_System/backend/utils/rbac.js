// Role → default permissions mapping. Membership can override with explicit permissions[].

const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: [
    'organization.manage', 'members.manage',
    'templates.read', 'templates.create', 'templates.update', 'templates.delete',
    'events.read', 'events.create', 'events.update', 'events.delete',
    'certificates.read', 'certificates.create', 'certificates.update', 'certificates.delete',
    'bulk.read', 'bulk.create', 'bulk.cancel', 'bulk.download',
    'audit.read', 'analytics.read'
  ],
  editor: [
    'templates.read', 'templates.create', 'templates.update',
    'events.read', 'events.create', 'events.update',
    'certificates.read', 'certificates.create',
    'bulk.read', 'bulk.create', 'bulk.download',
    'analytics.read'
  ],
  viewer: [
    'templates.read', 'events.read', 'certificates.read', 'bulk.read', 'analytics.read'
  ],
  guest: []
};

function permissionsForMembership(membership) {
  if (!membership) return [];
  const base = ROLE_PERMISSIONS[membership.role] || [];
  const extras = Array.isArray(membership.permissions) ? membership.permissions : [];
  return [...new Set([...base, ...extras])];
}

function membershipHas(membership, permission) {
  const perms = permissionsForMembership(membership);
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  // Wildcard like "certificates.*"
  const [ns] = permission.split('.');
  if (ns && perms.includes(`${ns}.*`)) return true;
  return false;
}

module.exports = { ROLE_PERMISSIONS, permissionsForMembership, membershipHas };

export const Roles = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  MODERATOR: "MODERATOR",
  USER: "USER",
  READ_ONLY: "READ_ONLY",
});

export const Permissions = Object.freeze({
  SNIPPET_READ_SELF: "snippet.read.self",
  SNIPPET_WRITE_SELF: "snippet.write.self",
  SNIPPET_DELETE_SELF: "snippet.delete.self",
  SNIPPET_PUBLIC_PUBLISH: "snippet.public.publish",
  COMMUNITY_VIEW_PUBLIC: "community.view.public",
  ADMIN_PANEL_ACCESS: "admin.panel.access",
  ADMIN_USERS_READ: "admin.users.read",
  ADMIN_USERS_WRITE: "admin.users.write",
  ADMIN_SNIPPETS_MODERATE: "admin.snippets.moderate",
  ADMIN_SYSTEM_SETTINGS_WRITE: "admin.system.settings.write",
  ADMIN_AUDIT_READ: "admin.audit.read",
  MODERATION_QUEUE_READ: "moderation.queue.read",
  MODERATION_ACTIONS_WRITE: "moderation.actions.write",
});

const rolePermissions = {
  [Roles.SUPER_ADMIN]: new Set(Object.values(Permissions)),
  [Roles.ADMIN]: new Set([
    Permissions.SNIPPET_READ_SELF,
    Permissions.SNIPPET_WRITE_SELF,
    Permissions.SNIPPET_DELETE_SELF,
    Permissions.SNIPPET_PUBLIC_PUBLISH,
    Permissions.COMMUNITY_VIEW_PUBLIC,
    Permissions.ADMIN_PANEL_ACCESS,
    Permissions.ADMIN_USERS_READ,
    Permissions.ADMIN_USERS_WRITE,
    Permissions.ADMIN_SNIPPETS_MODERATE,
    Permissions.ADMIN_SYSTEM_SETTINGS_WRITE,
    Permissions.ADMIN_AUDIT_READ,
    Permissions.MODERATION_QUEUE_READ,
    Permissions.MODERATION_ACTIONS_WRITE,
  ]),
  [Roles.MODERATOR]: new Set([
    Permissions.SNIPPET_READ_SELF,
    Permissions.SNIPPET_WRITE_SELF,
    Permissions.SNIPPET_DELETE_SELF,
    Permissions.SNIPPET_PUBLIC_PUBLISH,
    Permissions.COMMUNITY_VIEW_PUBLIC,
    Permissions.ADMIN_PANEL_ACCESS,
    Permissions.ADMIN_USERS_READ,
    Permissions.ADMIN_SNIPPETS_MODERATE,
    Permissions.MODERATION_QUEUE_READ,
    Permissions.MODERATION_ACTIONS_WRITE,
    Permissions.ADMIN_AUDIT_READ,
  ]),
  [Roles.USER]: new Set([
    Permissions.SNIPPET_READ_SELF,
    Permissions.SNIPPET_WRITE_SELF,
    Permissions.SNIPPET_DELETE_SELF,
    Permissions.SNIPPET_PUBLIC_PUBLISH,
    Permissions.COMMUNITY_VIEW_PUBLIC,
  ]),
  [Roles.READ_ONLY]: new Set([
    Permissions.SNIPPET_READ_SELF,
    Permissions.COMMUNITY_VIEW_PUBLIC,
  ]),
};

export function normalizeRole(role) {
  if (!role) {
    return Roles.USER;
  }

  const normalized = String(role).toUpperCase();
  if (rolePermissions[normalized]) {
    return normalized;
  }

  return Roles.USER;
}

export function getPermissionsByRole(role) {
  const normalizedRole = normalizeRole(role);
  return rolePermissions[normalizedRole] || rolePermissions[Roles.USER];
}

export function hasPermission(role, permission) {
  if (!permission) {
    return false;
  }

  return getPermissionsByRole(role).has(permission);
}

export function getRolePermissionList(role) {
  return Array.from(getPermissionsByRole(role)).sort();
}

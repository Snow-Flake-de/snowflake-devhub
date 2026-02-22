import { requirePermission } from "../security/aclMiddleware.js";
import { Permissions, Roles } from "../security/permissions.js";

export const requireAdmin = requirePermission(Permissions.ADMIN_PANEL_ACCESS);

export const isAdmin = (role) => {
  const normalized = String(role || "").toUpperCase();
  return normalized === Roles.SUPER_ADMIN || normalized === Roles.ADMIN;
};

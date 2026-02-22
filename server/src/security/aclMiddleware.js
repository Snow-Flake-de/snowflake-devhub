import Logger from "../logger.js";
import {
  hasPermission,
  getRolePermissionList,
  normalizeRole,
} from "./permissions.js";

export function attachPermissionContext(req, _res, next) {
  if (req.user) {
    req.user.role = normalizeRole(req.user.role);
    req.user.permissions = getRolePermissionList(req.user.role);
  }
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const role = normalizeRole(req.user.role);
    if (!hasPermission(role, permission)) {
      Logger.debug(
        `Permission denied: user=${req.user.username || req.user.id}, role=${role}, permission=${permission}`
      );
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    return next();
  };
}

export function requireAnyPermission(permissions = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const role = normalizeRole(req.user.role);
    const granted = permissions.some((permission) =>
      hasPermission(role, permission)
    );

    if (!granted) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    return next();
  };
}

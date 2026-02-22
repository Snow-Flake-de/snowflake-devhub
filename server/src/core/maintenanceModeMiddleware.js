import jwt from "jsonwebtoken";
import systemConfigRepository from "./systemConfigRepository.js";
import { JWT_SECRET } from "../middleware/auth.js";
import userRepository from "../repositories/userRepository.js";

const BypassApiPrefixes = ["/api/auth/config", "/api/auth/login", "/api/auth/oidc"];

function isMaintenanceEnabled() {
  const mode = systemConfigRepository.getSetting("maintenance.mode", "OFF");
  return ["ON", "TRUE", "1", "ENABLED"].includes(String(mode).toUpperCase());
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.bytestashauth;
  let token = authHeader && authHeader.split(" ")[1];
  if (!token && req.cookies) {
    token = req.cookies.bytestash_token;
  }
  return token || null;
}

function hasBypassPath(basePath, requestPath) {
  if (requestPath.includes("/api-docs")) {
    return true;
  }

  return BypassApiPrefixes.some((prefix) =>
    requestPath.startsWith(`${basePath}${prefix}`)
  );
}

export async function maintenanceModeGuard(req, res, next) {
  if (!isMaintenanceEnabled()) {
    return next();
  }

  const basePath = process.env.BASE_PATH || "";
  if (!req.path.startsWith(`${basePath}/api`) && !req.path.includes("/api-docs")) {
    return next();
  }

  if (hasBypassPath(basePath, req.path)) {
    return next();
  }

  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(503).json({ error: "Maintenance mode is enabled" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await userRepository.findById(decoded.id);
    const role = String(user?.role || "").toUpperCase();

    if (role === "SUPER_ADMIN" || role === "ADMIN") {
      return next();
    }

    return res.status(503).json({ error: "Maintenance mode is enabled" });
  } catch (_error) {
    return res.status(503).json({ error: "Maintenance mode is enabled" });
  }
}

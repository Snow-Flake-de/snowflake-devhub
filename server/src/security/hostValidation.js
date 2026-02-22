import Logger from "../logger.js";

const allowedHosts = (process.env.ALLOWED_HOSTS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (allowedHosts.length === 0) {
  Logger.info(
    "ALLOWED_HOSTS is empty. Host validation is permissive until ALLOWED_HOSTS is configured."
  );
}

export function validateHostHeader(req, res, next) {
  if (allowedHosts.length === 0) {
    return next();
  }

  const forwardedHost = req.get("X-Forwarded-Host");
  const rawHost = forwardedHost || req.get("host");

  if (!rawHost) {
    return res.status(400).json({ error: "Missing host header" });
  }

  const host = rawHost.split(",")[0].trim().split(":")[0].toLowerCase();
  if (!allowedHosts.includes(host)) {
    return res.status(400).json({ error: "Invalid host" });
  }

  return next();
}

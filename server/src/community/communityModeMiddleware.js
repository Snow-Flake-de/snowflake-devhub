import systemConfigRepository from "../core/systemConfigRepository.js";

function isEnabledValue(value) {
  return ["ON", "TRUE", "1", "ENABLED"].includes(String(value).toUpperCase());
}

export function isCommunityModeEnabled() {
  const mode = systemConfigRepository.getSetting("community.mode", "OFF");
  const publicLibraryFlag = systemConfigRepository.getFeatureFlag(
    "community.public_library",
    true
  );

  return isEnabledValue(mode) && publicLibraryFlag;
}

export function requireCommunityMode(req, res, next) {
  if (!isCommunityModeEnabled()) {
    return res.status(404).json({ error: "Community mode is disabled" });
  }

  return next();
}

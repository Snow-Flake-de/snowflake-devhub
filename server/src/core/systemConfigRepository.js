import { getDb } from "../config/database.js";
import Logger from "../logger.js";

const CACHE_TTL_MS = 5000;

class SystemConfigRepository {
  constructor() {
    this.statements = {};
    this.settingCache = new Map();
    this.flagCache = new Map();
  }

  #initializeStatements() {
    if (this.statements.getSetting) {
      return;
    }

    const db = getDb();
    this.statements.getSetting = db.prepare(`
      SELECT value
      FROM system_settings
      WHERE key = ?
    `);
    this.statements.upsertSetting = db.prepare(`
      INSERT INTO system_settings (key, value, updated_at, updated_by)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `);
    this.statements.getSettingsByPrefix = db.prepare(`
      SELECT key, value, updated_at
      FROM system_settings
      WHERE key LIKE ?
      ORDER BY key
    `);
    this.statements.getFeatureFlag = db.prepare(`
      SELECT enabled
      FROM feature_flags
      WHERE key = ?
    `);
    this.statements.getAllFeatureFlags = db.prepare(`
      SELECT key, enabled, description, updated_at
      FROM feature_flags
      ORDER BY key
    `);
    this.statements.upsertFeatureFlag = db.prepare(`
      INSERT INTO feature_flags (key, enabled, description, updated_at, updated_by)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(key) DO UPDATE SET
        enabled = excluded.enabled,
        description = COALESCE(excluded.description, feature_flags.description),
        updated_at = CURRENT_TIMESTAMP,
        updated_by = excluded.updated_by
    `);
  }

  #isFresh(cacheEntry) {
    if (!cacheEntry) {
      return false;
    }

    return Date.now() - cacheEntry.cachedAt < CACHE_TTL_MS;
  }

  #cacheValue(cache, key, value) {
    cache.set(key, {
      value,
      cachedAt: Date.now(),
    });
  }

  #readCached(cache, key) {
    const entry = cache.get(key);
    if (!this.#isFresh(entry)) {
      return undefined;
    }
    return entry.value;
  }

  getSetting(key, fallbackValue = null) {
    this.#initializeStatements();

    const cached = this.#readCached(this.settingCache, key);
    if (cached !== undefined) {
      return cached;
    }

    const row = this.statements.getSetting.get(key);
    const value = row ? row.value : fallbackValue;
    this.#cacheValue(this.settingCache, key, value);
    return value;
  }

  getNumberSetting(key, fallbackValue) {
    const value = this.getSetting(key, String(fallbackValue));
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return fallbackValue;
    }
    return parsed;
  }

  getBooleanSetting(key, fallbackValue = false) {
    const value = this.getSetting(key, fallbackValue ? "true" : "false");
    return ["1", "true", "on", "yes", "enabled", "open"].includes(
      String(value).toLowerCase()
    );
  }

  setSetting(key, value, updatedBy = null) {
    this.#initializeStatements();

    this.statements.upsertSetting.run(key, String(value), updatedBy);
    this.#cacheValue(this.settingCache, key, String(value));
  }

  getSettingsByPrefix(prefix) {
    this.#initializeStatements();
    return this.statements.getSettingsByPrefix.all(`${prefix}%`);
  }

  getFeatureFlag(key, fallbackValue = false) {
    this.#initializeStatements();

    const cached = this.#readCached(this.flagCache, key);
    if (cached !== undefined) {
      return cached;
    }

    const row = this.statements.getFeatureFlag.get(key);
    const value = row ? !!row.enabled : fallbackValue;
    this.#cacheValue(this.flagCache, key, value);
    return value;
  }

  setFeatureFlag(key, enabled, description = null, updatedBy = null) {
    this.#initializeStatements();

    try {
      this.statements.upsertFeatureFlag.run(
        key,
        enabled ? 1 : 0,
        description,
        updatedBy
      );
      this.#cacheValue(this.flagCache, key, !!enabled);
    } catch (error) {
      Logger.error("Error setting feature flag:", key, error);
      throw error;
    }
  }

  getFoundationSettings() {
    return {
      registrationMode: this.getSetting("registration.mode", "OPEN"),
      communityMode: this.getSetting("community.mode", "OFF"),
      maintenanceMode: this.getSetting("maintenance.mode", "OFF"),
      security: {
        lockout: {
          maxAttempts: this.getNumberSetting(
            "security.lockout.max_attempts",
            5
          ),
          durationMinutes: this.getNumberSetting(
            "security.lockout.duration_minutes",
            15
          ),
        },
        rateLimit: {
          windowMs: this.getNumberSetting("security.rate_limit.window_ms", 60000),
          authMax: this.getNumberSetting("security.rate_limit.auth_max", 20),
          publicMax: this.getNumberSetting("security.rate_limit.public_max", 120),
          generalMax: this.getNumberSetting(
            "security.rate_limit.general_max",
            300
          ),
        },
      },
    };
  }

  getAllSystemSettings() {
    this.#initializeStatements();
    const coreSettings = this.getSettingsByPrefix("");
    const flags = this.statements.getAllFeatureFlags.all();

    return {
      settings: coreSettings,
      featureFlags: flags.map((flag) => ({
        ...flag,
        enabled: !!flag.enabled,
      })),
    };
  }
}

export default new SystemConfigRepository();

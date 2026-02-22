import Logger from "../../logger.js";

const ROLE_VALUES = ["SUPER_ADMIN", "ADMIN", "MODERATOR", "USER", "READ_ONLY"];
const STATUS_VALUES = ["PENDING", "ACTIVE", "SUSPENDED"];
const VISIBILITY_VALUES = ["PRIVATE", "TEAM", "SHARED", "PUBLIC"];

function tableExists(db, tableName) {
  const row = db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `
    )
    .get(tableName);

  return !!row;
}

function columnExists(db, tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(db, tableName, columnName, definitionSql) {
  if (columnExists(db, tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
}

function ensureSystemSetting(db, key, value) {
  db.prepare(
    `
    INSERT INTO system_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO NOTHING
  `
  ).run(key, value);
}

function ensureFeatureFlag(db, key, enabled = 0, description = "") {
  db.prepare(
    `
    INSERT INTO feature_flags (key, enabled, description)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `
  ).run(key, enabled, description);
}

function ensureUsersColumns(db) {
  ensureColumn(db, "users", "role", "TEXT DEFAULT 'USER'");
  ensureColumn(db, "users", "status", "TEXT DEFAULT 'ACTIVE'");
  ensureColumn(db, "users", "failed_login_attempts", "INTEGER DEFAULT 0");
  ensureColumn(db, "users", "locked_until", "DATETIME");
  ensureColumn(db, "users", "force_password_reset", "BOOLEAN DEFAULT FALSE");
  ensureColumn(db, "users", "session_version", "INTEGER DEFAULT 1");

  db.exec(`
    UPDATE users
    SET role = CASE
      WHEN id = 0 THEN 'READ_ONLY'
      WHEN is_admin = 1 THEN 'ADMIN'
      ELSE 'USER'
    END
    WHERE role IS NULL OR role = '';
  `);

  db.exec(`
    UPDATE users
    SET role = 'USER'
    WHERE role NOT IN (${ROLE_VALUES.map((value) => `'${value}'`).join(", ")});
  `);

  db.exec(`
    UPDATE users
    SET status = CASE
      WHEN is_active = 0 THEN 'SUSPENDED'
      ELSE 'ACTIVE'
    END
    WHERE status IS NULL OR status = '';
  `);

  db.exec(`
    UPDATE users
    SET status = 'ACTIVE'
    WHERE status NOT IN (${STATUS_VALUES.map((value) => `'${value}'`).join(", ")});
  `);

  db.exec(`
    UPDATE users
    SET failed_login_attempts = 0
    WHERE failed_login_attempts IS NULL;
  `);

  db.exec(`
    UPDATE users
    SET session_version = 1
    WHERE session_version IS NULL OR session_version < 1;
  `);
}

function ensureSnippetColumns(db) {
  ensureColumn(db, "snippets", "visibility", "TEXT DEFAULT 'PRIVATE'");

  db.exec(`
    UPDATE snippets
    SET visibility = CASE
      WHEN is_public = 1 THEN 'PUBLIC'
      ELSE 'PRIVATE'
    END
    WHERE visibility IS NULL OR visibility = '';
  `);

  db.exec(`
    UPDATE snippets
    SET visibility = 'PRIVATE'
    WHERE visibility NOT IN (${VISIBILITY_VALUES.map((value) => `'${value}'`).join(", ")});
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_snippets_visibility ON snippets (visibility);
    CREATE INDEX IF NOT EXISTS idx_snippets_user_visibility ON snippets (user_id, visibility);
  `);
}

function ensureFoundationTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs (actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
  `);
}

function seedDefaults(db) {
  ensureSystemSetting(db, "registration.mode", "OPEN");
  ensureSystemSetting(db, "community.mode", "OFF");
  ensureSystemSetting(db, "maintenance.mode", "OFF");
  ensureSystemSetting(db, "security.lockout.max_attempts", "5");
  ensureSystemSetting(db, "security.lockout.duration_minutes", "15");
  ensureSystemSetting(db, "security.rate_limit.window_ms", "60000");
  ensureSystemSetting(db, "security.rate_limit.auth_max", "20");
  ensureSystemSetting(db, "security.rate_limit.public_max", "120");
  ensureSystemSetting(db, "security.rate_limit.general_max", "300");

  ensureFeatureFlag(
    db,
    "community.public_library",
    1,
    "Enable public library browsing endpoints and pages."
  );
  ensureFeatureFlag(
    db,
    "community.reports",
    0,
    "Enable snippet reporting and moderation queue."
  );
  ensureFeatureFlag(
    db,
    "platform.ai_hooks",
    0,
    "Reserved for future AI assistant module integration."
  );
}

function needsMigration(db) {
  return (
    !tableExists(db, "system_settings") ||
    !columnExists(db, "users", "role") ||
    !columnExists(db, "users", "status") ||
    !columnExists(db, "snippets", "visibility")
  );
}

export function up_v2_0_0_foundation_security(db) {
  if (!needsMigration(db)) {
    Logger.debug("v2.0.0-foundation-security - Migration not needed");
    return;
  }

  Logger.debug("v2.0.0-foundation-security - Starting migration...");

  try {
    db.exec("BEGIN TRANSACTION;");

    ensureUsersColumns(db);
    ensureSnippetColumns(db);
    ensureFoundationTables(db);
    seedDefaults(db);

    db.exec("COMMIT;");
    Logger.debug(
      "v2.0.0-foundation-security - Migration completed successfully"
    );
  } catch (error) {
    Logger.error("v2.0.0-foundation-security - Migration failed:", error);
    try {
      db.exec("ROLLBACK;");
    } catch (rollbackError) {
      Logger.error(
        "v2.0.0-foundation-security - Rollback failed:",
        rollbackError
      );
    }
    throw error;
  }
}

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    username_normalized TEXT,
    password_hash TEXT NOT NULL,
    oidc_id TEXT,
    oidc_provider TEXT,
    email TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_admin BOOLEAN DEFAULT FALSE,
    role TEXT NOT NULL DEFAULT 'USER',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until DATETIME,
    force_password_reset BOOLEAN DEFAULT FALSE,
    session_version INTEGER NOT NULL DEFAULT 1,
    last_login_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS snippets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expiry_date DATETIME DEFAULT NULL,
    user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT FALSE,
    visibility TEXT NOT NULL DEFAULT 'PRIVATE',
    is_pinned BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snippet_id INTEGER,
    name TEXT NOT NULL,
    FOREIGN KEY (snippet_id) REFERENCES snippets (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fragments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snippet_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    code TEXT NOT NULL,
    language TEXT NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (snippet_id) REFERENCES snippets (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shared_snippets (
    id TEXT PRIMARY KEY,
    snippet_id INTEGER NOT NULL,
    requires_auth BOOLEAN NOT NULL DEFAULT false,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (snippet_id) REFERENCES snippets (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

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

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_normalized ON users (
    username_normalized COLLATE NOCASE
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

CREATE INDEX IF NOT EXISTS idx_snippets_user_id ON snippets (user_id);

CREATE INDEX IF NOT EXISTS idx_snippets_visibility ON snippets (visibility);

CREATE INDEX IF NOT EXISTS idx_snippets_user_visibility ON snippets (user_id, visibility);

CREATE INDEX IF NOT EXISTS idx_categories_snippet_id ON categories (snippet_id);

CREATE INDEX IF NOT EXISTS idx_fragments_snippet_id ON fragments (snippet_id);

CREATE INDEX IF NOT EXISTS idx_shared_snippets_snippet_id ON shared_snippets (snippet_id);

CREATE INDEX idx_snippets_is_public ON snippets (is_public);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc ON users (oidc_id, oidc_provider)
WHERE
    oidc_id IS NOT NULL
    AND oidc_provider IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys (key);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs (actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

INSERT INTO system_settings (key, value)
VALUES
    ('registration.mode', 'OPEN'),
    ('community.mode', 'OFF'),
    ('maintenance.mode', 'OFF'),
    ('security.lockout.max_attempts', '5'),
    ('security.lockout.duration_minutes', '15'),
    ('security.rate_limit.window_ms', '60000'),
    ('security.rate_limit.auth_max', '20'),
    ('security.rate_limit.public_max', '120'),
    ('security.rate_limit.general_max', '300')
ON CONFLICT(key) DO NOTHING;

INSERT INTO feature_flags (key, enabled, description)
VALUES
    ('community.public_library', 1, 'Enable public library browsing endpoints and pages.'),
    ('community.reports', 0, 'Enable snippet reporting and moderation queue.'),
    ('platform.ai_hooks', 0, 'Reserved for future AI assistant module integration.')
ON CONFLICT(key) DO NOTHING;

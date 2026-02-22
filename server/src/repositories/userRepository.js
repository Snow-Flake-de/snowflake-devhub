import { getDb } from '../config/database.js';
import bcrypt from 'bcrypt';
import Logger from '../logger.js';

class UserRepository {
  constructor() {
    this.createUserStmt = null;
    this.findByUsernameStmt = null;
    this.findByIdStmt = null;
    this.findByOIDCIdStmt = null;
    this.createUserWithOIDCStmt = null;
    this.updatePasswordStmt = null;
    this.findByIdWithPasswordStmt = null;
    this.updateFailedLoginStmt = null;
    this.resetFailedLoginStmt = null;
    this.unlockUserStmt = null;
    this.updateStatusStmt = null;
    this.updateRoleStmt = null;
    this.incrementSessionVersionStmt = null;
    this.setForcePasswordResetStmt = null;
  }

  #initializeStatements() {
    if (!this.createUserStmt) {
      const db = getDb();

      this.createUserStmt = db.prepare(`
        INSERT INTO users (username, username_normalized, password_hash, role, status)
        VALUES (?, ?, ?, ?, ?)
      `);

      this.findByUsernameStmt = db.prepare(`
        SELECT
          id,
          username,
          password_hash,
          created_at,
          email,
          name,
          oidc_id,
          oidc_provider,
          is_admin,
          role,
          status,
          is_active,
          failed_login_attempts,
          locked_until,
          force_password_reset,
          session_version
        FROM users
        WHERE username_normalized = ? COLLATE NOCASE
      `);

      this.findByIdStmt = db.prepare(`
        SELECT
          id,
          username,
          created_at,
          email,
          name,
          oidc_id,
          oidc_provider,
          is_admin,
          role,
          status,
          is_active,
          failed_login_attempts,
          locked_until,
          force_password_reset,
          session_version,
          last_login_at
        FROM users
        WHERE id = ?
      `);

      this.findByIdWithPasswordStmt = db.prepare(`
        SELECT
          id,
          username,
          password_hash,
          created_at,
          email,
          name,
          oidc_id,
          role,
          status,
          failed_login_attempts,
          locked_until,
          force_password_reset,
          session_version
        FROM users
        WHERE id = ?
      `);

      this.findByOIDCIdStmt = db.prepare(`
        SELECT
          id,
          username,
          created_at,
          email,
          name,
          is_admin,
          role,
          status,
          is_active,
          failed_login_attempts,
          locked_until,
          force_password_reset,
          session_version
        FROM users
        WHERE oidc_id = ? AND oidc_provider = ?
      `);

      this.createUserWithOIDCStmt = db.prepare(`
        INSERT INTO users (
          username, 
          username_normalized,
          password_hash, 
          oidc_id, 
          oidc_provider, 
          email, 
          name,
          role,
          status
        ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)
      `);

      this.findUsernameCountStmt = db.prepare(`
        SELECT COUNT(*) as count 
        FROM users 
        WHERE username_normalized = ? COLLATE NOCASE
      `);

      this.createAnonymousUserStmt = db.prepare(`
        INSERT INTO users (
          id,
          username, 
          username_normalized,
          password_hash,
          created_at,
          role,
          status
        ) VALUES (0, ?, ?, '', datetime('now'), 'READ_ONLY', 'ACTIVE')
        ON CONFLICT(id) DO NOTHING
      `);

      this.updatePasswordStmt = db.prepare(`
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
      `);

      this.updateLastLoginStmt = db.prepare(`
        UPDATE users
        SET last_login_at = CURRENT_TIMESTAMP,
            failed_login_attempts = 0,
            locked_until = NULL
        WHERE id = ?
      `);

      this.updateFailedLoginStmt = db.prepare(`
        UPDATE users
        SET
          failed_login_attempts = ?,
          locked_until = ?
        WHERE id = ?
      `);

      this.resetFailedLoginStmt = db.prepare(`
        UPDATE users
        SET failed_login_attempts = 0,
            locked_until = NULL
        WHERE id = ?
      `);

      this.unlockUserStmt = db.prepare(`
        UPDATE users
        SET failed_login_attempts = 0,
            locked_until = NULL,
            status = 'ACTIVE'
        WHERE id = ? AND id != 0
      `);

      this.updateStatusStmt = db.prepare(`
        UPDATE users
        SET
          status = ?,
          is_active = CASE WHEN ? = 'SUSPENDED' THEN 0 ELSE 1 END
        WHERE id = ? AND id != 0
      `);

      this.updateRoleStmt = db.prepare(`
        UPDATE users
        SET role = ?,
            is_admin = CASE WHEN ? IN ('SUPER_ADMIN', 'ADMIN') THEN 1 ELSE 0 END
        WHERE id = ? AND id != 0
      `);

      this.incrementSessionVersionStmt = db.prepare(`
        UPDATE users
        SET session_version = session_version + 1
        WHERE id = ? AND id != 0
      `);

      this.setForcePasswordResetStmt = db.prepare(`
        UPDATE users
        SET force_password_reset = ?,
            session_version = session_version + 1
        WHERE id = ? AND id != 0
      `);
    }
  }

  async create(username, password, options = {}) {
    this.#initializeStatements();
    
    try {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const normalizedUsername = username.toLowerCase();
      const role = options.role || "USER";
      const status = options.status || "ACTIVE";

      const result = this.createUserStmt.run(
        username,
        normalizedUsername,
        passwordHash,
        role,
        status
      );
      
      return this.findById(result.lastInsertRowid);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        throw new Error('Username already exists');
      }
      throw error;
    }
  }

  async findByUsername(username) {
    this.#initializeStatements();
    return this.findByUsernameStmt.get(username.toLowerCase());
  }

  async findById(id) {
    this.#initializeStatements();
    return this.findByIdStmt.get(id);
  }

  async findByIdWithPassword(id) {
    this.#initializeStatements();
    return this.findByIdWithPasswordStmt.get(id);
  }

  async verifyPassword(user, password) {
    if (!user?.password_hash) {
      return false;
    }
    return bcrypt.compare(password, user.password_hash);
  }

  async generateUniqueUsername(baseUsername) {
    this.#initializeStatements();
    let username = baseUsername;
    let counter = 1;
    
    while (this.findUsernameCountStmt.get(username.toLowerCase()).count > 0) {
      username = `${baseUsername}${counter}`;
      counter++;
    }
    
    return username;
  }

  async findOrCreateOIDCUser(profile, provider, options = {}) {
    this.#initializeStatements();
    
    try {
      const user = this.findByOIDCIdStmt.get(profile.sub, provider);
      if (user) return user;

      const sanitizeName = (name) => {
        return name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 30);
      };

      let baseUsername = profile.preferred_username
        ? sanitizeName(profile.preferred_username)
        : profile.email?.split("@")[0] || (profile.name
          ? sanitizeName(profile.name)
          : profile.sub);
                          
      const username = await this.generateUniqueUsername(baseUsername);

      const result = this.createUserWithOIDCStmt.run(
        username,
        username.toLowerCase(),
        profile.sub,
        provider,
        profile.email,
        profile.name,
        options.role || "USER",
        options.status || "ACTIVE"
      );
      
      return this.findById(result.lastInsertRowid);
    } catch (error) {
      Logger.error('Error in findOrCreateOIDCUser:', error);
      throw error;
    }
  }

  async findByOIDCId(oidcId, provider) {
    this.#initializeStatements();
    return this.findByOIDCIdStmt.get(oidcId, provider);
  }

  async createAnonymousUser(username) {
    this.#initializeStatements();
    
    try {
      this.createAnonymousUserStmt.run(
        username,
        username.toLowerCase()
      );
      
      return {
        id: 0,
        username,
        role: "READ_ONLY",
        status: "ACTIVE",
        session_version: 1,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      Logger.error('Error creating anonymous user:', error);
      throw error;
    }
  }

  async updatePassword(userId, newPassword) {
    this.#initializeStatements();

    try {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      const result = this.updatePasswordStmt.run(passwordHash, userId);

      if (result.changes === 0) {
        throw new Error('User not found or password not updated');
      }

      return true;
    } catch (error) {
      Logger.error('Error updating password:', error);
      throw error;
    }
  }

  async updateLastLogin(userId) {
    this.#initializeStatements();

    try {
      this.updateLastLoginStmt.run(userId);
    } catch (error) {
      Logger.error('Error updating last login:', error);
      throw error;
    }
  }

  async recordFailedLogin(user, { maxAttempts = 5, lockoutMinutes = 15 } = {}) {
    this.#initializeStatements();

    if (!user) {
      return;
    }

    const currentAttempts = user.failed_login_attempts || 0;
    const nextAttempts = currentAttempts + 1;
    let lockedUntil = null;

    if (nextAttempts >= maxAttempts) {
      lockedUntil = new Date(
        Date.now() + Math.max(1, lockoutMinutes) * 60 * 1000
      )
        .toISOString()
        .replace("T", " ")
        .replace("Z", "");
    }

    this.updateFailedLoginStmt.run(nextAttempts, lockedUntil, user.id);
  }

  async resetFailedLoginAttempts(userId) {
    this.#initializeStatements();
    this.resetFailedLoginStmt.run(userId);
  }

  async unlockUser(userId) {
    this.#initializeStatements();
    const result = this.unlockUserStmt.run(userId);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(userId);
  }

  async updateRole(userId, role) {
    this.#initializeStatements();
    const result = this.updateRoleStmt.run(role, role, userId);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(userId);
  }

  async updateStatus(userId, status) {
    this.#initializeStatements();
    const result = this.updateStatusStmt.run(status, status, userId);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(userId);
  }

  async incrementSessionVersion(userId) {
    this.#initializeStatements();
    const result = this.incrementSessionVersionStmt.run(userId);
    return result.changes > 0;
  }

  async setForcePasswordReset(userId, forcePasswordReset) {
    this.#initializeStatements();
    const result = this.setForcePasswordResetStmt.run(
      forcePasswordReset ? 1 : 0,
      userId
    );
    return result.changes > 0;
  }
}

export default new UserRepository();

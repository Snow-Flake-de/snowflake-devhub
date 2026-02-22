import { getDb } from "../config/database.js";
import Logger from "../logger.js";

class AuditLogRepository {
  constructor() {
    this.insertStmt = null;
    this.listStmt = null;
  }

  #initializeStatements() {
    if (this.insertStmt) {
      return;
    }

    const db = getDb();
    this.insertStmt = db.prepare(`
      INSERT INTO audit_logs (
        actor_id,
        action,
        target_type,
        target_id,
        metadata,
        ip_address,
        user_agent,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    this.listStmt = db.prepare(`
      SELECT
        al.id,
        al.actor_id,
        al.action,
        al.target_type,
        al.target_id,
        al.metadata,
        al.ip_address,
        al.user_agent,
        al.created_at,
        u.username AS actor_username
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_id
      ORDER BY al.created_at DESC
      LIMIT ?
      OFFSET ?
    `);
  }

  getRequestContext(req) {
    if (!req) {
      return {
        ipAddress: null,
        userAgent: null,
      };
    }

    return {
      ipAddress:
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null,
      userAgent: req.headers["user-agent"] || null,
    };
  }

  log({
    actorId = null,
    action,
    targetType = null,
    targetId = null,
    metadata = null,
    req = null,
  }) {
    this.#initializeStatements();

    if (!action) {
      return;
    }

    const context = this.getRequestContext(req);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    try {
      this.insertStmt.run(
        actorId,
        action,
        targetType,
        targetId === null || targetId === undefined ? null : String(targetId),
        metadataJson,
        context.ipAddress,
        context.userAgent
      );
    } catch (error) {
      Logger.error("Failed to write audit log:", action, error);
    }
  }

  list({ limit = 50, offset = 0 } = {}) {
    this.#initializeStatements();
    return this.listStmt.all(limit, offset).map((entry) => ({
      ...entry,
      metadata: entry.metadata ? JSON.parse(entry.metadata) : null,
    }));
  }
}

export default new AuditLogRepository();

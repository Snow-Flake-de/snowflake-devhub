import express from 'express';
import userService from '../services/userService.js';
import userRepository from '../repositories/userRepository.js';
import { getDb } from '../config/database.js';
import { up_v1_5_0_snippets } from '../config/migrations/20241117-migration.js';
import {
  DISABLE_ACCOUNTS,
  DISABLE_INTERNAL_ACCOUNTS,
  ALLOW_PASSWORD_CHANGES,
  getOrCreateAnonymousUser,
  authenticateToken,
  createSessionToken,
  setAuthCookie,
  clearAuthCookie,
} from '../middleware/auth.js';
import Logger from '../logger.js';
import systemConfigRepository from '../core/systemConfigRepository.js';
import auditLogRepository from '../security/auditLogRepository.js';
import { getRolePermissionList } from '../security/permissions.js';

const router = express.Router();

const RegistrationModes = Object.freeze({
  OPEN: 'OPEN',
  APPROVAL: 'APPROVAL',
  CLOSED: 'CLOSED',
});

function normalizeRegistrationMode(mode) {
  const upper = String(mode || '').toUpperCase();
  if (Object.values(RegistrationModes).includes(upper)) {
    return upper;
  }
  return RegistrationModes.OPEN;
}

function getAuthConfig() {
  const registrationMode = normalizeRegistrationMode(
    systemConfigRepository.getSetting('registration.mode', 'OPEN')
  );
  const communityMode = String(
    systemConfigRepository.getSetting('community.mode', 'OFF')
  ).toUpperCase();
  const maintenanceMode = String(
    systemConfigRepository.getSetting('maintenance.mode', 'OFF')
  ).toUpperCase();

  return {
    registrationMode,
    communityMode,
    maintenanceMode,
  };
}

function buildUserResponse(user) {
  const permissions = getRolePermissionList(user.role || 'USER');
  return {
    id: user.id,
    username: user.username,
    created_at: user.created_at,
    email: user.email,
    name: user.name,
    role: user.role || 'USER',
    status: user.status || 'ACTIVE',
    permissions,
    is_admin: permissions.includes('admin.panel.access'),
    is_active: user.is_active,
    force_password_reset: !!user.force_password_reset,
    last_login_at: user.last_login_at || null,
  };
}

function isLocked(user) {
  if (!user?.locked_until) {
    return false;
  }
  return new Date(user.locked_until).getTime() > Date.now();
}

router.get('/config', async (_req, res) => {
  try {
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE id != 0').get().count;
    const hasUsers = userCount > 0;

    const { registrationMode, communityMode, maintenanceMode } = getAuthConfig();
    const allowNewAccounts =
      !hasUsers ||
      (!DISABLE_ACCOUNTS &&
        registrationMode !== RegistrationModes.CLOSED &&
        !DISABLE_INTERNAL_ACCOUNTS);

    res.json({
      authRequired: true,
      allowNewAccounts,
      registrationMode,
      hasUsers,
      disableAccounts: DISABLE_ACCOUNTS,
      disableInternalAccounts: DISABLE_INTERNAL_ACCOUNTS,
      allowPasswordChanges: ALLOW_PASSWORD_CHANGES,
      communityMode,
      maintenanceMode,
    });
  } catch (error) {
    Logger.error('Error getting auth config:', error);
    res.status(500).json({ error: 'Failed to get auth configuration' });
  }
});

router.post('/register', async (req, res) => {
  try {
    if (DISABLE_INTERNAL_ACCOUNTS) {
      return res
        .status(403)
        .json({ error: 'Internal account registration is disabled' });
    }

    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE id != 0').get().count;
    const hasUsers = userCount > 0;
    const { registrationMode } = getAuthConfig();

    let desiredRole = 'USER';
    let desiredStatus = 'ACTIVE';

    if (!hasUsers) {
      desiredRole = 'SUPER_ADMIN';
      desiredStatus = 'ACTIVE';
    } else if (registrationMode === RegistrationModes.CLOSED) {
      return res.status(403).json({ error: 'New account registration is closed' });
    } else if (registrationMode === RegistrationModes.APPROVAL) {
      desiredStatus = 'PENDING';
    }

    const { username, password } = req.body;
    const user = await userService.createUser(username, password, {
      role: desiredRole,
      status: desiredStatus,
    });

    if (!hasUsers) {
      await up_v1_5_0_snippets(db, user.id);
    }

    auditLogRepository.log({
      actorId: user.id,
      action: 'user.registration',
      targetType: 'user',
      targetId: user.id,
      metadata: {
        role: user.role,
        status: user.status,
        registrationMode,
      },
      req,
    });

    if (desiredStatus === 'PENDING') {
      return res.status(202).json({
        pendingApproval: true,
        message: 'Registration submitted and awaiting admin approval',
        user: buildUserResponse(user),
      });
    }

    const token = createSessionToken(user);
    setAuthCookie(res, token, req);

    return res.json({
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    Logger.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    if (DISABLE_INTERNAL_ACCOUNTS) {
      return res.status(403).json({ error: 'Internal accounts are disabled' });
    }

    const { username, password } = req.body;
    const user = await userRepository.findByUsername(username);

    if (!user) {
      auditLogRepository.log({
        action: 'auth.login.failed',
        targetType: 'user',
        targetId: username,
        metadata: {
          reason: 'user_not_found',
          username,
        },
        req,
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (isLocked(user)) {
      auditLogRepository.log({
        actorId: user.id,
        action: 'auth.login.blocked',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          reason: 'account_locked',
          lockedUntil: user.locked_until,
        },
        req,
      });
      return res.status(423).json({
        error: 'Account temporarily locked due to failed login attempts',
        lockedUntil: user.locked_until,
      });
    }

    const isPasswordValid = await userRepository.verifyPassword(user, password);
    if (!isPasswordValid) {
      const securitySettings = systemConfigRepository.getFoundationSettings().security;
      await userRepository.recordFailedLogin(user, {
        maxAttempts: securitySettings.lockout.maxAttempts,
        lockoutMinutes: securitySettings.lockout.durationMinutes,
      });

      auditLogRepository.log({
        actorId: user.id,
        action: 'auth.login.failed',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          reason: 'invalid_password',
        },
        req,
      });

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status === 'PENDING') {
      auditLogRepository.log({
        actorId: user.id,
        action: 'auth.login.blocked',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          reason: 'pending_approval',
        },
        req,
      });
      return res.status(403).json({ error: 'Account pending approval' });
    }

    if (user.status === 'SUSPENDED' || user.is_active === 0 || user.is_active === false) {
      auditLogRepository.log({
        actorId: user.id,
        action: 'auth.login.blocked',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          reason: 'suspended',
        },
        req,
      });
      return res.status(403).json({ error: 'Account suspended' });
    }

    await userRepository.updateLastLogin(user.id);

    const refreshedUser = await userRepository.findById(user.id);
    const token = createSessionToken(refreshedUser);
    setAuthCookie(res, token, req);

    auditLogRepository.log({
      actorId: user.id,
      action: 'auth.login.success',
      targetType: 'user',
      targetId: user.id,
      metadata: {
        role: refreshedUser.role,
      },
      req,
    });

    res.json({ token, user: buildUserResponse(refreshedUser) });
  } catch (error) {
    Logger.error('Login error:', error);
    res.status(500).json({ error: 'An error occurred during login' });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  clearAuthCookie(res, req);
  res.json({ success: true });
});

router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const user = await userService.findById(req.user.id);

    if (!user) {
      clearAuthCookie(res, req);
      return res.status(401).json({ valid: false });
    }

    res.status(200).json({
      valid: true,
      user: buildUserResponse(user),
    });
  } catch (_error) {
    clearAuthCookie(res, req);
    res.status(401).json({ valid: false });
  }
});

router.post('/anonymous', async (req, res) => {
  if (!DISABLE_ACCOUNTS) {
    return res.status(403).json({ error: 'Anonymous login not allowed' });
  }

  try {
    const anonymousUser = await getOrCreateAnonymousUser();
    const token = createSessionToken({
      ...anonymousUser,
      role: 'READ_ONLY',
      status: 'ACTIVE',
      session_version: 1,
    });

    setAuthCookie(res, token, req);

    res.json({
      token,
      user: {
        ...anonymousUser,
        role: 'READ_ONLY',
        status: 'ACTIVE',
        permissions: getRolePermissionList('READ_ONLY'),
      },
    });
  } catch (error) {
    Logger.error('Error in anonymous login:', error);
    res.status(500).json({ error: 'Failed to create anonymous session' });
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    if (!ALLOW_PASSWORD_CHANGES) {
      return res.status(403).json({ error: 'Password changes are disabled' });
    }

    if (DISABLE_INTERNAL_ACCOUNTS) {
      return res.status(403).json({ error: 'Internal accounts are disabled' });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ error: 'Current password and new password are required' });
    }

    const user = await userService.findById(userId);
    if (user?.oidc_id) {
      return res.status(403).json({
        error: 'Password change not available for external authentication accounts',
      });
    }

    await userService.changePassword(userId, currentPassword, newPassword);
    await userRepository.setForcePasswordReset(userId, false);

    auditLogRepository.log({
      actorId: userId,
      action: 'auth.password.changed',
      targetType: 'user',
      targetId: userId,
      req,
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    Logger.error('Change password error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;

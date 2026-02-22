import express from 'express';
import adminRepository from '../repositories/adminRepository.js';
import badWordsChecker from '../utils/badWords.js';
import Logger from '../logger.js';
import systemConfigRepository from '../core/systemConfigRepository.js';
import auditLogRepository from '../security/auditLogRepository.js';
import { requirePermission } from '../security/aclMiddleware.js';
import { Permissions, Roles } from '../security/permissions.js';

const router = express.Router();

const editableRoles = new Set(Object.values(Roles));
const editableStatuses = new Set(['PENDING', 'ACTIVE', 'SUSPENDED']);

function assertNotSelfMutation(req, userId) {
  if (userId === req.user.id) {
    return 'Cannot modify your own account in this action';
  }
  return null;
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function writeAdminAudit({
  req,
  action,
  targetType,
  targetId,
  metadata,
}) {
  auditLogRepository.log({
    actorId: req.user.id,
    action,
    targetType,
    targetId,
    metadata,
    req,
  });
}

router.get('/stats', requirePermission(Permissions.ADMIN_PANEL_ACCESS), async (_req, res) => {
  try {
    const stats = await adminRepository.getStats();
    res.json(stats);
  } catch (error) {
    Logger.error('Error getting admin stats:', error);
    res.status(500).json({ message: 'Failed to retrieve statistics' });
  }
});

router.get('/users', requirePermission(Permissions.ADMIN_USERS_READ), async (req, res) => {
  try {
    const {
      offset = 0,
      limit = 50,
      search = '',
      authType = '',
      isActive = '',
      status = '',
      role = '',
    } = req.query;

    const result = await adminRepository.getAllUsers({
      offset: parseInt(offset),
      limit: Math.min(parseInt(limit), 100),
      search,
      authType,
      isActive,
      status,
      role,
    });
    res.json(result);
  } catch (error) {
    Logger.error('Error getting users:', error);
    res.status(500).json({ message: 'Failed to retrieve users' });
  }
});

router.get('/users/:id', requirePermission(Permissions.ADMIN_USERS_READ), async (req, res) => {
  try {
    const user = await adminRepository.getUserDetails(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    Logger.error('Error getting user details:', error);
    res.status(500).json({ message: 'Failed to retrieve user details' });
  }
});

router.delete('/users/:id', requirePermission(Permissions.ADMIN_USERS_WRITE), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const selfError = assertNotSelfMutation(req, userId);
    if (selfError) {
      return res.status(400).json({ message: selfError });
    }

    if (userId === 0) {
      return res.status(400).json({ message: 'Cannot delete anonymous user' });
    }

    const deleted = await adminRepository.deleteUser(userId);
    if (!deleted) {
      return res.status(404).json({ message: 'User not found' });
    }

    writeAdminAudit({
      req,
      action: 'admin.user.delete',
      targetType: 'user',
      targetId: userId,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    Logger.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

router.patch('/users/:id/toggle-active', requirePermission(Permissions.ADMIN_USERS_WRITE), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const selfError = assertNotSelfMutation(req, userId);
    if (selfError) {
      return res.status(400).json({ message: selfError });
    }
    if (userId === 0) {
      return res.status(400).json({ message: 'Cannot modify anonymous user' });
    }

    const user = await adminRepository.toggleUserActive(userId);
    writeAdminAudit({
      req,
      action: 'admin.user.toggle_active',
      targetType: 'user',
      targetId: userId,
      metadata: {
        status: user.status,
      },
    });
    res.json(user);
  } catch (error) {
    Logger.error('Error toggling user active status:', error);
    res.status(500).json({ message: 'Failed to update user status' });
  }
});

router.patch('/users/:id/status', requirePermission(Permissions.ADMIN_USERS_WRITE), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const status = String(req.body?.status || '').toUpperCase();
    const selfError = assertNotSelfMutation(req, userId);
    if (selfError) {
      return res.status(400).json({ message: selfError });
    }
    if (!editableStatuses.has(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    const user = await adminRepository.setUserStatus(userId, status);

    writeAdminAudit({
      req,
      action: status === 'ACTIVE' ? 'admin.user.approve' : 'admin.user.status_change',
      targetType: 'user',
      targetId: userId,
      metadata: { status },
    });

    res.json(user);
  } catch (error) {
    Logger.error('Error updating user status:', error);
    res.status(500).json({ message: 'Failed to update user status' });
  }
});

router.patch('/users/:id/role', requirePermission(Permissions.ADMIN_USERS_WRITE), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const role = String(req.body?.role || '').toUpperCase();
    const selfError = assertNotSelfMutation(req, userId);
    if (selfError) {
      return res.status(400).json({ message: selfError });
    }
    if (!editableRoles.has(role)) {
      return res.status(400).json({ message: 'Invalid role value' });
    }

    const user = await adminRepository.setUserRole(userId, role);

    writeAdminAudit({
      req,
      action: 'admin.user.role_change',
      targetType: 'user',
      targetId: userId,
      metadata: { role },
    });

    res.json(user);
  } catch (error) {
    Logger.error('Error updating user role:', error);
    res.status(500).json({ message: 'Failed to update user role' });
  }
});

router.patch('/users/:id/unlock', requirePermission(Permissions.ADMIN_USERS_WRITE), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await adminRepository.unlockUser(userId);

    writeAdminAudit({
      req,
      action: 'admin.user.unlock',
      targetType: 'user',
      targetId: userId,
    });

    res.json(user);
  } catch (error) {
    Logger.error('Error unlocking user:', error);
    res.status(500).json({ message: 'Failed to unlock user' });
  }
});

router.patch('/users/:id/reset-sessions', requirePermission(Permissions.ADMIN_USERS_WRITE), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const selfError = assertNotSelfMutation(req, userId);
    if (selfError) {
      return res.status(400).json({ message: selfError });
    }
    const user = await adminRepository.resetUserSessions(userId);

    writeAdminAudit({
      req,
      action: 'admin.user.reset_sessions',
      targetType: 'user',
      targetId: userId,
    });

    res.json(user);
  } catch (error) {
    Logger.error('Error resetting user sessions:', error);
    res.status(500).json({ message: 'Failed to reset user sessions' });
  }
});

router.patch('/users/:id/force-password-reset', requirePermission(Permissions.ADMIN_USERS_WRITE), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const forcePasswordReset = normalizeBool(req.body?.forcePasswordReset, true);
    const user = await adminRepository.setForcePasswordReset(userId, forcePasswordReset);

    writeAdminAudit({
      req,
      action: 'admin.user.force_password_reset',
      targetType: 'user',
      targetId: userId,
      metadata: { forcePasswordReset },
    });

    res.json(user);
  } catch (error) {
    Logger.error('Error toggling force password reset:', error);
    res.status(500).json({ message: 'Failed to update force password reset state' });
  }
});

router.get('/snippets', requirePermission(Permissions.ADMIN_SNIPPETS_MODERATE), async (req, res) => {
  try {
    const {
      offset = 0,
      limit = 50,
      search = '',
      userId = '',
      isPublic = '',
      language = '',
      category = '',
    } = req.query;
    const result = await adminRepository.getAllSnippets({
      offset: parseInt(offset),
      limit: Math.min(parseInt(limit), 100),
      search,
      userId,
      isPublic,
      language,
      category,
    });
    res.json(result);
  } catch (error) {
    Logger.error('Error getting snippets:', error);
    res.status(500).json({ message: 'Failed to retrieve snippets' });
  }
});

router.delete('/snippets/:id', requirePermission(Permissions.ADMIN_SNIPPETS_MODERATE), async (req, res) => {
  try {
    const deleted = await adminRepository.deleteSnippetPermanently(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    writeAdminAudit({
      req,
      action: 'admin.snippet.delete',
      targetType: 'snippet',
      targetId: req.params.id,
    });

    res.json({ message: 'Snippet deleted successfully' });
  } catch (error) {
    Logger.error('Error deleting snippet:', error);
    res.status(500).json({ message: 'Failed to delete snippet' });
  }
});

router.patch('/snippets/:id/owner', requirePermission(Permissions.ADMIN_SNIPPETS_MODERATE), async (req, res) => {
  try {
    const { newUserId } = req.body;

    if (!newUserId) {
      return res.status(400).json({ message: 'newUserId is required' });
    }

    await adminRepository.changeSnippetOwner(req.params.id, newUserId);
    writeAdminAudit({
      req,
      action: 'admin.snippet.owner_change',
      targetType: 'snippet',
      targetId: req.params.id,
      metadata: { newUserId },
    });
    res.json({ message: 'Snippet owner changed successfully' });
  } catch (error) {
    Logger.error('Error changing snippet owner:', error);
    res.status(500).json({ message: 'Failed to change snippet owner' });
  }
});

router.patch('/snippets/:id/toggle-public', requirePermission(Permissions.ADMIN_SNIPPETS_MODERATE), async (req, res) => {
  try {
    await adminRepository.toggleSnippetPublic(req.params.id);
    writeAdminAudit({
      req,
      action: 'admin.snippet.visibility_change',
      targetType: 'snippet',
      targetId: req.params.id,
    });
    res.json({ message: 'Snippet visibility toggled successfully' });
  } catch (error) {
    Logger.error('Error toggling snippet public status:', error);
    res.status(500).json({ message: 'Failed to toggle snippet visibility' });
  }
});

router.get('/snippets/scan/offensive', requirePermission(Permissions.ADMIN_SNIPPETS_MODERATE), async (_req, res) => {
  try {
    const result = await adminRepository.scanSnippetsForOffensiveContent(badWordsChecker);
    res.json(result);
  } catch (error) {
    Logger.error('Error scanning snippets for offensive content:', error);
    res.status(500).json({ message: 'Failed to scan snippets for offensive content' });
  }
});

router.get('/snippets/:id', requirePermission(Permissions.ADMIN_SNIPPETS_MODERATE), async (req, res) => {
  try {
    const snippet = await adminRepository.getSnippetDetails(req.params.id);
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }
    res.json(snippet);
  } catch (error) {
    Logger.error('Error getting snippet details:', error);
    res.status(500).json({ message: 'Failed to retrieve snippet details' });
  }
});

router.get('/api-keys', requirePermission(Permissions.ADMIN_USERS_READ), async (req, res) => {
  try {
    const { offset = 0, limit = 50, userId = '' } = req.query;
    const result = await adminRepository.getAllApiKeys({
      offset: parseInt(offset),
      limit: Math.min(parseInt(limit), 100),
      userId,
    });
    res.json(result);
  } catch (error) {
    Logger.error('Error getting API keys:', error);
    res.status(500).json({ message: 'Failed to retrieve API keys' });
  }
});

router.delete('/api-keys/:id', requirePermission(Permissions.ADMIN_USERS_WRITE), async (req, res) => {
  try {
    const deleted = await adminRepository.deleteApiKey(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'API key not found' });
    }

    writeAdminAudit({
      req,
      action: 'admin.api_key.delete',
      targetType: 'api_key',
      targetId: req.params.id,
    });

    res.json({ message: 'API key deleted successfully' });
  } catch (error) {
    Logger.error('Error deleting API key:', error);
    res.status(500).json({ message: 'Failed to delete API key' });
  }
});

router.get('/shares', requirePermission(Permissions.ADMIN_USERS_READ), async (req, res) => {
  try {
    const { offset = 0, limit = 50, userId = '', requiresAuth = '' } = req.query;
    const result = await adminRepository.getAllShares({
      offset: parseInt(offset),
      limit: Math.min(parseInt(limit), 100),
      userId,
      requiresAuth,
    });
    res.json(result);
  } catch (error) {
    Logger.error('Error getting shares:', error);
    res.status(500).json({ message: 'Failed to retrieve shares' });
  }
});

router.delete('/shares/:id', requirePermission(Permissions.ADMIN_USERS_WRITE), async (req, res) => {
  try {
    const deleted = await adminRepository.deleteShare(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Share not found' });
    }

    writeAdminAudit({
      req,
      action: 'admin.share.delete',
      targetType: 'share',
      targetId: req.params.id,
    });

    res.json({ message: 'Share deleted successfully' });
  } catch (error) {
    Logger.error('Error deleting share:', error);
    res.status(500).json({ message: 'Failed to delete share' });
  }
});

router.get('/settings', requirePermission(Permissions.ADMIN_PANEL_ACCESS), async (_req, res) => {
  try {
    const all = systemConfigRepository.getAllSystemSettings();
    const foundation = systemConfigRepository.getFoundationSettings();

    res.json({
      ...all,
      foundation,
    });
  } catch (error) {
    Logger.error('Error loading settings:', error);
    res.status(500).json({ message: 'Failed to load settings' });
  }
});

router.patch('/settings', requirePermission(Permissions.ADMIN_SYSTEM_SETTINGS_WRITE), async (req, res) => {
  try {
    const {
      registrationMode,
      communityMode,
      maintenanceMode,
      lockoutMaxAttempts,
      lockoutDurationMinutes,
      authRateLimit,
      publicRateLimit,
      generalRateLimit,
      rateLimitWindowMs,
      featureFlags,
    } = req.body || {};

    const normalizedRegistrationMode =
      registrationMode !== undefined ? String(registrationMode).toUpperCase() : undefined;
    if (
      normalizedRegistrationMode !== undefined &&
      !['OPEN', 'APPROVAL', 'CLOSED'].includes(normalizedRegistrationMode)
    ) {
      return res.status(400).json({ message: 'Invalid registration mode' });
    }

    const normalizedCommunityMode =
      communityMode !== undefined ? String(communityMode).toUpperCase() : undefined;
    if (
      normalizedCommunityMode !== undefined &&
      !['ON', 'OFF'].includes(normalizedCommunityMode)
    ) {
      return res.status(400).json({ message: 'Invalid community mode' });
    }

    const normalizedMaintenanceMode =
      maintenanceMode !== undefined ? String(maintenanceMode).toUpperCase() : undefined;
    if (
      normalizedMaintenanceMode !== undefined &&
      !['ON', 'OFF'].includes(normalizedMaintenanceMode)
    ) {
      return res.status(400).json({ message: 'Invalid maintenance mode' });
    }

    if (normalizedRegistrationMode !== undefined) {
      systemConfigRepository.setSetting(
        'registration.mode',
        normalizedRegistrationMode,
        req.user.id
      );
    }
    if (normalizedCommunityMode !== undefined) {
      systemConfigRepository.setSetting(
        'community.mode',
        normalizedCommunityMode,
        req.user.id
      );
    }
    if (normalizedMaintenanceMode !== undefined) {
      systemConfigRepository.setSetting(
        'maintenance.mode',
        normalizedMaintenanceMode,
        req.user.id
      );
    }
    if (lockoutMaxAttempts !== undefined) {
      systemConfigRepository.setSetting(
        'security.lockout.max_attempts',
        String(lockoutMaxAttempts),
        req.user.id
      );
    }
    if (lockoutDurationMinutes !== undefined) {
      systemConfigRepository.setSetting(
        'security.lockout.duration_minutes',
        String(lockoutDurationMinutes),
        req.user.id
      );
    }
    if (rateLimitWindowMs !== undefined) {
      systemConfigRepository.setSetting(
        'security.rate_limit.window_ms',
        String(rateLimitWindowMs),
        req.user.id
      );
    }
    if (authRateLimit !== undefined) {
      systemConfigRepository.setSetting(
        'security.rate_limit.auth_max',
        String(authRateLimit),
        req.user.id
      );
    }
    if (publicRateLimit !== undefined) {
      systemConfigRepository.setSetting(
        'security.rate_limit.public_max',
        String(publicRateLimit),
        req.user.id
      );
    }
    if (generalRateLimit !== undefined) {
      systemConfigRepository.setSetting(
        'security.rate_limit.general_max',
        String(generalRateLimit),
        req.user.id
      );
    }

    if (featureFlags && typeof featureFlags === 'object') {
      for (const [flagKey, enabled] of Object.entries(featureFlags)) {
        systemConfigRepository.setFeatureFlag(
          flagKey,
          !!enabled,
          null,
          req.user.id
        );
      }
    }

    writeAdminAudit({
      req,
      action: 'admin.settings.update',
      targetType: 'system',
      targetId: 'settings',
      metadata: {
        registrationMode,
        communityMode,
        maintenanceMode,
      },
    });

    const all = systemConfigRepository.getAllSystemSettings();
    const foundation = systemConfigRepository.getFoundationSettings();
    res.json({ ...all, foundation });
  } catch (error) {
    Logger.error('Error updating settings:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

router.get('/audit', requirePermission(Permissions.ADMIN_AUDIT_READ), async (req, res) => {
  try {
    const { offset = 0, limit = 50 } = req.query;
    const result = await adminRepository.getAuditLogs({
      offset: parseInt(offset),
      limit: Math.min(parseInt(limit), 100),
    });
    res.json(result);
  } catch (error) {
    Logger.error('Error loading audit logs:', error);
    res.status(500).json({ message: 'Failed to load audit logs' });
  }
});

export default router;

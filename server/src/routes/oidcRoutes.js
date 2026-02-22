import express from 'express';
import { OIDCConfig } from '../oidc/oidcConfig.js';
import userRepository from '../repositories/userRepository.js';
import Logger from '../logger.js';
import { getDb } from '../config/database.js';
import { up_v1_5_0_snippets } from '../config/migrations/20241117-migration.js';
import {
  createSessionToken,
  setAuthCookie,
  clearAuthCookie,
} from '../middleware/auth.js';
import systemConfigRepository from '../core/systemConfigRepository.js';
import auditLogRepository from '../security/auditLogRepository.js';

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

function getBaseUrl(req) {
  const forwardedProto = req.get('X-Forwarded-Proto');

  const isSecure =
    req.secure || forwardedProto === 'https' || req.get('X-Forwarded-SSL') === 'on';

  const protocol = isSecure ? 'https' : 'http';
  const host = req.get('X-Forwarded-Host') || req.get('Host');

  const baseUrl = `${protocol}://${host}${process.env.BASE_PATH || ''}`;
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

router.get('/config', async (_req, res) => {
  try {
    const oidc = await OIDCConfig.getInstance();
    res.json(oidc.getConfig());
  } catch (error) {
    Logger.error('OIDC config fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch OIDC configuration' });
  }
});

router.get('/auth', async (req, res) => {
  try {
    const oidc = await OIDCConfig.getInstance();
    if (!oidc.isEnabled()) {
      return res.redirect('/login?error=config_error');
    }

    const baseUrl = getBaseUrl(req);
    const authUrl = await oidc.getAuthorizationUrl(baseUrl, oidc.getScopes().join(' '));

    Logger.debug('Generated auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    Logger.error('OIDC auth error:', error);
    const errorMessage = encodeURIComponent(error.message || 'Unknown error');
    res.redirect(`/login?error=provider_error&message=${errorMessage}`);
  }
});

router.get('/logout', async (req, res) => {
  try {
    const oidc = await OIDCConfig.getInstance();
    if (!oidc.isEnabled()) {
      clearAuthCookie(res, req);
      return res.redirect('/');
    }

    const token = req.cookies?.bytestash_token;

    if (!token) {
      clearAuthCookie(res, req);
      return res.status(401).json({ valid: false });
    }

    const baseUrl = getBaseUrl(req);
    const logoutUrl = await oidc.getLogoutUrl(
      baseUrl,
      token
    );

    OIDCConfig.instance = null;
    clearAuthCookie(res, req);
    res.redirect(logoutUrl);
  } catch (error) {
    Logger.error('OIDC logout error:', error);
    const errorMessage = encodeURIComponent(error.message || 'Unknown error');
    res.redirect(`/login?error=provider_error&message=${errorMessage}`);
  }
});

router.get('/callback', async (req, res) => {
  try {
    const oidc = await OIDCConfig.getInstance();
    if (!oidc.isEnabled()) {
      return res.status(404).json({ error: 'OIDC not enabled' });
    }

    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE id != 0').get().count;
    const hasUsers = userCount > 0;
    const registrationMode = normalizeRegistrationMode(
      systemConfigRepository.getSetting('registration.mode', 'OPEN')
    );

    const baseUrl = getBaseUrl(req);
    const callbackUrl = oidc.getCallbackUrl(baseUrl);
    const queryString = new URLSearchParams(req.query).toString();
    const currentUrl = queryString ? `${callbackUrl}?${queryString}` : callbackUrl;

    const { tokens, userInfo } = await oidc.handleCallback(currentUrl, callbackUrl);

    const issuer = oidc.config.serverMetadata().issuer;
    const existingUser = await userRepository.findByOIDCId(userInfo.sub, issuer);
    const isNewUser = !existingUser;

    if (hasUsers && isNewUser && registrationMode === RegistrationModes.CLOSED) {
      auditLogRepository.log({
        action: 'auth.oidc.registration.blocked',
        targetType: 'user',
        targetId: userInfo.sub,
        metadata: {
          reason: 'registration_closed',
          provider: issuer,
        },
        req,
      });
      return res.redirect('/login?error=registration_disabled');
    }

    const createdRole = !hasUsers ? 'SUPER_ADMIN' : 'USER';
    const createdStatus =
      hasUsers && registrationMode === RegistrationModes.APPROVAL ? 'PENDING' : 'ACTIVE';

    const user = await userRepository.findOrCreateOIDCUser(userInfo, issuer, {
      role: createdRole,
      status: createdStatus,
    });

    if (!hasUsers) {
      await up_v1_5_0_snippets(db, user.id);
    }

    if (isNewUser && createdStatus === 'PENDING') {
      auditLogRepository.log({
        actorId: user.id,
        action: 'user.registration',
        targetType: 'user',
        targetId: user.id,
        metadata: {
          provider: issuer,
          status: createdStatus,
          registrationMode,
        },
        req,
      });
      return res.redirect('/login?error=pending_approval');
    }

    if (user.status === 'SUSPENDED' || user.is_active === 0 || user.is_active === false) {
      return res.redirect(
        '/login?error=account_deactivated&message=Your account has been deactivated'
      );
    }

    if (user.status === 'PENDING') {
      return res.redirect('/login?error=pending_approval');
    }

    await userRepository.updateLastLogin(user.id);
    const refreshedUser = await userRepository.findById(user.id);
    const token = createSessionToken(refreshedUser, {
      id_token: tokens.id_token,
    });

    auditLogRepository.log({
      actorId: user.id,
      action: 'auth.login.success',
      targetType: 'user',
      targetId: user.id,
      metadata: {
        provider: issuer,
        oidc: true,
      },
      req,
    });

    setAuthCookie(res, token, req);
    oidc.loggedIn = true;

    res.redirect(`${process.env.BASE_PATH || ''}/auth/callback?token=${token}`);
  } catch (error) {
    Logger.error('OIDC callback error:', error);
    let errorType = 'auth_failed';
    let errorDetails = '';

    if (error.message?.includes('state parameter')) {
      errorType = 'auth_failed';
      errorDetails = 'Your authentication session has expired';
    } else if (error.message?.includes('accounts disabled')) {
      errorType = 'registration_disabled';
    } else if (error.message?.includes('OIDC configuration')) {
      errorType = 'config_error';
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      errorType = 'provider_error';
      errorDetails = 'Authorization denied by identity provider';
    }

    const messageParam = errorDetails ? `&message=${encodeURIComponent(errorDetails)}` : '';
    res.redirect(`/login?error=${errorType}${messageParam}`);
  }
});

export default router;

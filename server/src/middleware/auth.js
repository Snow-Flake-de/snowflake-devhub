import fs from 'fs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Logger from '../logger.js';
import userRepository from '../repositories/userRepository.js';

function getJwtSecret() {
  if (process.env.JWT_SECRET_FILE) {
    try {
      return fs.readFileSync(process.env.JWT_SECRET_FILE, 'utf8').trim();
    } catch (error) {
      console.error('Error reading JWT secret file:', error);
      process.exit(1);
    }
  }
  return process.env.JWT_SECRET || 'your-secret-key';
}

const JWT_SECRET = getJwtSecret();
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '24h';
const DISABLE_ACCOUNTS = process.env.DISABLE_ACCOUNTS === 'true';
const DISABLE_INTERNAL_ACCOUNTS = process.env.DISABLE_INTERNAL_ACCOUNTS === 'true';
const ALLOW_PASSWORD_CHANGES = process.env.ALLOW_PASSWORD_CHANGES === 'true';
const ALLOW_NEW_ACCOUNTS = process.env.ALLOW_NEW_ACCOUNTS === 'true';

function generateAnonymousUsername() {
  return `anon-${crypto.randomBytes(8).toString('hex')}`;
}

async function getOrCreateAnonymousUser() {
  try {
    let existingUser = await userRepository.findById(0);
    
    if (existingUser) {
      return existingUser;
    }

    return await userRepository.createAnonymousUser(generateAnonymousUsername());
  } catch (error) {
    Logger.error('Error getting/creating anonymous user:', error);
    throw error;
  }
}

function getTokenFromRequest(req) {
  const authHeader = req.headers['bytestashauth'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && req.cookies) {
    token = req.cookies.bytestash_token;
  }

  return token || null;
}

function isSecureRequest(req) {
  const forwardedProto = req.get('X-Forwarded-Proto');
  return req.secure || forwardedProto === 'https';
}

function buildAuthCookieOptions(req) {
  const secure = isSecureRequest(req) || process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: process.env.BASE_PATH || '/',
    maxAge: 24 * 60 * 60 * 1000,
  };
}

function setAuthCookie(res, token, req) {
  res.cookie('bytestash_token', token, buildAuthCookieOptions(req));
}

function clearAuthCookie(res, req) {
  res.clearCookie('bytestash_token', buildAuthCookieOptions(req));
}

function createSessionToken(user, extraPayload = {}) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role || 'USER',
    status: user.status || 'ACTIVE',
    sessionVersion: user.session_version || 1,
    ...extraPayload,
  };

  return jwt.sign(
    payload,
    JWT_SECRET,
    TOKEN_EXPIRY ? { expiresIn: TOKEN_EXPIRY } : undefined
  );
}

const authenticateToken = async (req, res, next) => {
  if (req.user && req.apiKey) {
    return next();
  }

  if (DISABLE_ACCOUNTS) {
    try {
      const anonymousUser = await getOrCreateAnonymousUser();
      req.user = anonymousUser;
      return next();
    } catch (error) {
      Logger.error('Error in anonymous authentication:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const dbUser = await userRepository.findById(decoded.id);

    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (dbUser.status === 'SUSPENDED' || dbUser.is_active === 0) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    if ((decoded.sessionVersion || 1) !== (dbUser.session_version || 1)) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = {
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role || 'USER',
      status: dbUser.status || 'ACTIVE',
      is_admin: dbUser.is_admin,
      session_version: dbUser.session_version || 1,
      force_password_reset: !!dbUser.force_password_reset,
    };

    return next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export { 
  authenticateToken, 
  JWT_SECRET, 
  TOKEN_EXPIRY, 
  ALLOW_NEW_ACCOUNTS, 
  DISABLE_ACCOUNTS,
  DISABLE_INTERNAL_ACCOUNTS,
  ALLOW_PASSWORD_CHANGES,
  getOrCreateAnonymousUser,
  createSessionToken,
  setAuthCookie,
  clearAuthCookie,
};

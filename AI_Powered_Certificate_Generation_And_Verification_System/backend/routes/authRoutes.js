// Auth routes: register, login, logout, logout-all, refresh, me, sessions,
// verify-email, forgot-password, reset-password, change-password, orgs,
// memberships, invitations.

const express = require('express');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const {
  signAccessToken, generateRefreshToken, verifyRefreshToken,
  sha256, randomTokenUrl64, ACCESS_TTL, REFRESH_TTL
} = require('../utils/tokens');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/passwords');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');
const { logAudit } = require('../utils/audit');
const { ROLE_PERMISSIONS, permissionsForMembership } = require('../utils/rbac');

function nowIso() { return new Date().toISOString(); }
function inSecondsFromNow(seconds) { return new Date(Date.now() + seconds * 1000); }

// Brute-force lockout policy
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function cookieOptions() {
  const secure = String(process.env.COOKIE_SECURE || 'true') === 'true';
  const sameSite = process.env.COOKIE_SAMESITE || 'none';
  return { httpOnly: true, secure, sameSite, path: '/' };
}

function setAuthCookies(res, accessToken, refreshToken) {
  const base = cookieOptions();
  res.cookie('access_token', accessToken, { ...base, maxAge: ACCESS_TTL * 1000 });
  res.cookie('refresh_token', refreshToken, { ...base, maxAge: REFRESH_TTL * 1000, path: '/api/auth' });
}

function clearAuthCookies(res) {
  const base = cookieOptions();
  res.clearCookie('access_token', base);
  res.clearCookie('refresh_token', { ...base, path: '/api/auth' });
}

function sanitizeUser(u) {
  if (!u) return null;
  const { password_hash, _id, ...rest } = u;
  return rest;
}

const { getDB } = require('../config/db');
const mw = require('../middleware/authMiddleware');
  const router = express.Router();

  // Ensure indexes (best-effort)
  (async () => {
    try {
      await getDB().collection('users').createIndex({ email: 1 }, { unique: true });
      await getDB().collection('sessions').createIndex({ user_id: 1 });
      await getDB().collection('sessions').createIndex({ token_hash: 1 });
      await getDB().collection('sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
      await getDB().collection('email_verification_tokens').createIndex({ token_hash: 1 });
      await getDB().collection('email_verification_tokens').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
      await getDB().collection('password_reset_tokens').createIndex({ token_hash: 1 });
      await getDB().collection('password_reset_tokens').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
      await getDB().collection('login_attempts').createIndex({ identifier: 1 });
      await getDB().collection('login_attempts').createIndex({ last_attempt: 1 }, { expireAfterSeconds: LOCK_MINUTES * 60 * 4 });
      await getDB().collection('organizations').createIndex({ slug: 1 }, { unique: true, sparse: true });
      await getDB().collection('organization_memberships').createIndex({ user_id: 1, organization_id: 1 }, { unique: true });
    } catch (e) { /* indexes may already exist */ }
  })();

  // Ensure a default organization exists — first user becomes super_admin of it.
  async function ensureDefaultOrg(creatorId) {
    let org = await getDB().collection('organizations').findOne({ is_default: true });
    if (!org) {
      const doc = {
        id: uuidv4(),
        name: process.env.DEFAULT_ORG_NAME || 'CampusCert Demo',
        slug: 'default',
        is_default: true,
        plan: 'free',
        created_at: nowIso(),
        created_by: creatorId
      };
      await getDB().collection('organizations').insertOne(doc);
      org = doc;
    }
    return org;
  }

  // Determine whether this is the very first user in the whole system.
  async function isFirstUser() {
    return (await getDB().collection('users').countDocuments()) === 0;
  }

  // Brute force helpers
  async function checkLockout(identifier) {
    const rec = await getDB().collection('login_attempts').findOne({ identifier });
    if (rec?.locked_until && new Date(rec.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(rec.locked_until) - Date.now()) / 60000);
      return { locked: true, minutes: minutesLeft };
    }
    return { locked: false };
  }
  async function recordFailedAttempt(identifier) {
    const now = new Date();
    const rec = await getDB().collection('login_attempts').findOne({ identifier });
    const attempts = (rec?.attempts || 0) + 1;
    const patch = { attempts, last_attempt: now };
    if (attempts >= MAX_ATTEMPTS) patch.locked_until = new Date(now.getTime() + LOCK_MINUTES * 60000);
    await getDB().collection('login_attempts').updateOne(
      { identifier }, { $set: patch }, { upsert: true }
    );
    return attempts;
  }
  async function clearAttempts(identifier) {
    await getDB().collection('login_attempts').deleteOne({ identifier });
  }

  // -------- Rate limiters --------
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again later.' }
  });
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many registrations from this IP.' }
  });
  const forgotLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many password reset requests.' }
  });

  // ================= REGISTER =================
  router.post('/register', registerLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const name = String(req.body?.name || '').trim() || email.split('@')[0];

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
      const strengthErr = validatePasswordStrength(password);
      if (strengthErr) return res.status(400).json({ error: strengthErr });

      const existing = await getDB().collection('users').findOne({ email });
      if (existing) return res.status(409).json({ error: 'Email already registered' });

      const firstUser = await isFirstUser();
      const userId = uuidv4();
      const passwordHash = await hashPassword(password);

      const org = await ensureDefaultOrg(userId);

      const userDoc = {
        id: userId, email, name, password_hash: passwordHash,
        email_verified: false, status: 'active',
        current_org_id: org.id,
        created_at: nowIso(), updated_at: nowIso()
      };
      await getDB().collection('users').insertOne(userDoc);

      const role = firstUser ? 'super_admin' : 'editor';
      await getDB().collection('organization_memberships').insertOne({
        id: uuidv4(),
        user_id: userId, organization_id: org.id,
        role, permissions: [], status: 'active',
        joined_at: nowIso(), invited_by: null
      });

      // Verification token
      const rawToken = randomTokenUrl64();
      await getDB().collection('email_verification_tokens').insertOne({
        user_id: userId,
        token_hash: sha256(rawToken),
        expires_at: inSecondsFromNow(60 * 60 * 24), // 24h
        used_at: null, created_at: nowIso()
      });
      const emailResult = await sendVerificationEmail(userDoc, rawToken);

      await logAudit(db, {
        action: 'AUTH_REGISTER', user_id: userId, organization_id: org.id,
        role, ip: req.ip, user_agent: req.headers['user-agent'] || ''
      });

      // Auto-login on register (issue tokens + set cookies)
      const membership = await getDB().collection('organization_memberships').findOne({ user_id: userId, organization_id: org.id });
      const sessionId = uuidv4();
      const { token: refresh, jti } = generateRefreshToken(userDoc, sessionId);
      await getDB().collection('sessions').insertOne({
        id: sessionId, user_id: userId, jti, token_hash: sha256(refresh),
        ip: req.ip, user_agent: req.headers['user-agent'] || '',
        created_at: nowIso(), last_used_at: nowIso(),
        expires_at: inSecondsFromNow(REFRESH_TOKEN_TTL_ENV()),
        revoked_at: null, rotated_from: null
      });
      const access = signAccessToken(userDoc, membership);
      setAuthCookies(res, access, refresh);

      return res.json({
        user: sanitizeUser(userDoc),
        organization: org,
        membership: { ...membership, permissions: permissionsForMembership(membership) },
        access_token: access,
        // Dev-mode: expose the link so testing agent / user can verify without a real inbox.
        email_verification: {
          delivered: emailResult.delivered,
          dev_mode: emailResult.dev_mode,
          link: emailResult.dev_mode ? emailResult.link : undefined
        }
      });
    } catch (err) {
      console.error('register error', err);
      res.status(500).json({ error: err.message });
    }
  });

  function REFRESH_TOKEN_TTL_ENV() {
    return parseInt(process.env.REFRESH_TOKEN_TTL || '604800', 10);
  }

  // ================= LOGIN =================
  router.post('/login', loginLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      const identifier = `${req.ip}:${email}`;
      const lock = await checkLockout(identifier);
      if (lock.locked) {
        await logAudit(db, { action: 'AUTH_LOGIN_LOCKED', email, ip: req.ip });
        return res.status(429).json({ error: `Account locked for ${lock.minutes} more minute(s)` });
      }

      const user = await getDB().collection('users').findOne({ email });
      if (!user || user.status === 'suspended') {
        await recordFailedAttempt(identifier);
        await logAudit(db, { action: 'AUTH_LOGIN_FAIL', email, ip: req.ip, reason: 'not_found_or_suspended' });
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        const attempts = await recordFailedAttempt(identifier);
        await logAudit(db, { action: 'AUTH_LOGIN_FAIL', email, user_id: user.id, ip: req.ip, attempts });
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      await clearAttempts(identifier);

      const membership = await getDB().collection('organization_memberships').findOne({
        user_id: user.id, organization_id: user.current_org_id, status: 'active'
      });
      const organization = user.current_org_id
        ? await getDB().collection('organizations').findOne({ id: user.current_org_id })
        : null;

      const sessionId = uuidv4();
      const { token: refresh, jti } = generateRefreshToken(user, sessionId);
      await getDB().collection('sessions').insertOne({
        id: sessionId, user_id: user.id, jti, token_hash: sha256(refresh),
        ip: req.ip, user_agent: req.headers['user-agent'] || '',
        created_at: nowIso(), last_used_at: nowIso(),
        expires_at: inSecondsFromNow(REFRESH_TOKEN_TTL_ENV()),
        revoked_at: null, rotated_from: null
      });
      const access = signAccessToken(user, membership);
      setAuthCookies(res, access, refresh);

      await logAudit(db, { action: 'AUTH_LOGIN', user_id: user.id, organization_id: user.current_org_id, ip: req.ip });

      res.json({
        user: sanitizeUser(user),
        organization,
        membership: membership ? { ...membership, permissions: permissionsForMembership(membership) } : null,
        access_token: access
      });
    } catch (err) {
      console.error('login error', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ================= REFRESH =================
  router.post('/refresh', async (req, res) => {
    try {
      const raw = req.cookies?.refresh_token || req.body?.refresh_token;
      if (!raw) return res.status(401).json({ error: 'No refresh token' });

      let decoded;
      try { decoded = verifyRefreshToken(raw); }
      catch { return res.status(401).json({ error: 'Invalid refresh token' }); }

      const session = await getDB().collection('sessions').findOne({
        id: decoded.sid, user_id: decoded.sub, token_hash: sha256(raw), revoked_at: null
      });
      if (!session) {
        // Token reuse detection: if the refresh was rotated, revoke ALL sessions for the user.
        await getDB().collection('sessions').updateMany(
          { user_id: decoded.sub, revoked_at: null },
          { $set: { revoked_at: nowIso(), revoke_reason: 'reuse_detected' } }
        );
        await logAudit(db, { action: 'AUTH_REFRESH_REUSE_DETECTED', user_id: decoded.sub, ip: req.ip });
        return res.status(401).json({ error: 'Refresh token invalid or reused' });
      }
      if (new Date(session.expires_at) < new Date()) {
        return res.status(401).json({ error: 'Refresh token expired' });
      }

      const user = await getDB().collection('users').findOne({ id: decoded.sub });
      if (!user || user.status === 'suspended') return res.status(401).json({ error: 'User inactive' });

      // Rotate: create a new session and revoke the old one
      const newSessionId = uuidv4();
      const { token: newRefresh } = generateRefreshToken(user, newSessionId);
      await getDB().collection('sessions').insertOne({
        id: newSessionId, user_id: user.id, jti: crypto.randomBytes(16).toString('hex'),
        token_hash: sha256(newRefresh),
        ip: req.ip, user_agent: req.headers['user-agent'] || '',
        created_at: nowIso(), last_used_at: nowIso(),
        expires_at: inSecondsFromNow(REFRESH_TOKEN_TTL_ENV()),
        revoked_at: null, rotated_from: session.id
      });
      await getDB().collection('sessions').updateOne({ id: session.id }, {
        $set: { revoked_at: nowIso(), revoke_reason: 'rotated', last_used_at: nowIso() }
      });

      const membership = await getDB().collection('organization_memberships').findOne({
        user_id: user.id, organization_id: user.current_org_id, status: 'active'
      });
      const access = signAccessToken(user, membership);
      setAuthCookies(res, access, newRefresh);
      res.json({ access_token: access, expires_in: ACCESS_TTL });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ================= LOGOUT =================
  router.post('/logout', mw.authenticateUser({ optional: true }), async (req, res) => {
    try {
      const raw = req.cookies?.refresh_token;
      if (raw) {
        await getDB().collection('sessions').updateOne(
          { token_hash: sha256(raw), revoked_at: null },
          { $set: { revoked_at: nowIso(), revoke_reason: 'logout' } }
        );
      }
      if (req.user) {
        await logAudit(db, { action: 'AUTH_LOGOUT', user_id: req.user.id, ip: req.ip });
      }
      clearAuthCookies(res);
      res.json({ message: 'Logged out' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ================= LOGOUT ALL =================
  router.post('/logout-all', mw.authenticateUser(), async (req, res) => {
    try {
      await getDB().collection('sessions').updateMany(
        { user_id: req.user.id, revoked_at: null },
        { $set: { revoked_at: nowIso(), revoke_reason: 'logout_all' } }
      );
      await logAudit(db, { action: 'AUTH_LOGOUT_ALL', user_id: req.user.id, ip: req.ip });
      clearAuthCookies(res);
      res.json({ message: 'All sessions revoked' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ================= ME =================
  router.get('/me', mw.authenticateUser(), async (req, res) => {
    const memberships = await getDB().collection('organization_memberships').find(
      { user_id: req.user.id, status: 'active' }
    ).toArray();
    const orgIds = memberships.map(m => m.organization_id);
    const orgs = await getDB().collection('organizations').find({ id: { $in: orgIds } }).toArray();
    const active = memberships.find(m => m.organization_id === req.user.current_org_id) || memberships[0];
    res.json({
      user: sanitizeUser(req.user),
      memberships: memberships.map(m => ({
        ...m,
        organization: orgs.find(o => o.id === m.organization_id),
        permissions: permissionsForMembership(m)
      })),
      active_membership: active ? {
        ...active,
        organization: orgs.find(o => o.id === active.organization_id),
        permissions: permissionsForMembership(active)
      } : null
    });
  });

  // ================= SWITCH ORG =================
  router.post('/switch-organization', mw.authenticateUser(), async (req, res) => {
    const orgId = req.body?.organization_id;
    if (!orgId) return res.status(400).json({ error: 'organization_id required' });
    const membership = await getDB().collection('organization_memberships').findOne({
      user_id: req.user.id, organization_id: orgId, status: 'active'
    });
    if (!membership) return res.status(403).json({ error: 'Not a member of this organization' });
    await getDB().collection('users').updateOne(
      { id: req.user.id },
      { $set: { current_org_id: orgId, updated_at: nowIso() } }
    );
    // Reissue access token bound to new org
    const user = { ...req.user, current_org_id: orgId };
    const access = signAccessToken(user, membership);
    setAuthCookies(res, access, req.cookies?.refresh_token || '');
    await logAudit(db, { action: 'AUTH_ORG_SWITCH', user_id: req.user.id, organization_id: orgId, ip: req.ip });
    res.json({ access_token: access, organization_id: orgId, membership });
  });

  // ================= SESSIONS list / revoke =================
  router.get('/sessions', mw.authenticateUser(), async (req, res) => {
    const sessions = await getDB().collection('sessions').find(
      { user_id: req.user.id },
      { projection: { token_hash: 0, jti: 0 } }
    ).sort({ created_at: -1 }).limit(100).toArray();
    // Mark the current session
    const currentHash = req.cookies?.refresh_token ? sha256(req.cookies.refresh_token) : null;
    const currentSession = currentHash
      ? await getDB().collection('sessions').findOne({ token_hash: currentHash })
      : null;
    res.json(sessions.map(s => ({ ...s, current: currentSession && s.id === currentSession.id })));
  });

  router.delete('/sessions/:id', mw.authenticateUser(), async (req, res) => {
    const result = await getDB().collection('sessions').updateOne(
      { id: req.params.id, user_id: req.user.id, revoked_at: null },
      { $set: { revoked_at: nowIso(), revoke_reason: 'manual' } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Session not found' });
    await logAudit(db, { action: 'AUTH_SESSION_REVOKED', user_id: req.user.id, session_id: req.params.id });
    res.json({ message: 'Session revoked' });
  });

  // ================= EMAIL VERIFICATION =================
  router.post('/verify-email', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token required' });
    const rec = await getDB().collection('email_verification_tokens').findOne({
      token_hash: sha256(token), used_at: null
    });
    if (!rec) return res.status(400).json({ error: 'Invalid or already-used token' });
    if (new Date(rec.expires_at) < new Date()) return res.status(400).json({ error: 'Token expired' });

    await getDB().collection('users').updateOne(
      { id: rec.user_id },
      { $set: { email_verified: true, updated_at: nowIso() } }
    );
    await getDB().collection('email_verification_tokens').updateOne({ _id: rec._id }, { $set: { used_at: nowIso() } });
    await logAudit(db, { action: 'AUTH_EMAIL_VERIFIED', user_id: rec.user_id, ip: req.ip });
    res.json({ message: 'Email verified' });
  });

  router.post('/resend-verification', mw.authenticateUser(), async (req, res) => {
    if (req.user.email_verified) return res.status(400).json({ error: 'Email already verified' });
    const rawToken = randomTokenUrl64();
    await getDB().collection('email_verification_tokens').insertOne({
      user_id: req.user.id, token_hash: sha256(rawToken),
      expires_at: inSecondsFromNow(60 * 60 * 24), used_at: null, created_at: nowIso()
    });
    const emailResult = await sendVerificationEmail(req.user, rawToken);
    res.json({
      message: 'Verification email sent',
      dev_mode: emailResult.dev_mode,
      link: emailResult.dev_mode ? emailResult.link : undefined
    });
  });

  // ================= FORGOT / RESET PASSWORD =================
  router.post('/forgot-password', forgotLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    // Always respond OK to avoid email enumeration
    const user = await getDB().collection('users').findOne({ email });
    if (user) {
      const rawToken = randomTokenUrl64();
      await getDB().collection('password_reset_tokens').insertOne({
        user_id: user.id, token_hash: sha256(rawToken),
        expires_at: inSecondsFromNow(60 * 60), used_at: null, created_at: nowIso()
      });
      const emailResult = await sendPasswordResetEmail(user, rawToken);
      await logAudit(db, { action: 'AUTH_PASSWORD_RESET_REQUESTED', user_id: user.id, ip: req.ip });
      // In dev mode, surface the link so testing agent can verify.
      return res.json({
        message: 'If that account exists, a reset email has been sent.',
        dev_mode: emailResult.dev_mode,
        link: emailResult.dev_mode ? emailResult.link : undefined
      });
    }
    res.json({ message: 'If that account exists, a reset email has been sent.' });
  });

  router.post('/reset-password', async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.new_password || '');
    if (!token) return res.status(400).json({ error: 'Token required' });
    const strengthErr = validatePasswordStrength(newPassword);
    if (strengthErr) return res.status(400).json({ error: strengthErr });

    const rec = await getDB().collection('password_reset_tokens').findOne({
      token_hash: sha256(token), used_at: null
    });
    if (!rec) return res.status(400).json({ error: 'Invalid or already-used token' });
    if (new Date(rec.expires_at) < new Date()) return res.status(400).json({ error: 'Token expired' });

    const passwordHash = await hashPassword(newPassword);
    await getDB().collection('users').updateOne(
      { id: rec.user_id },
      { $set: { password_hash: passwordHash, updated_at: nowIso() } }
    );
    await getDB().collection('password_reset_tokens').updateOne({ _id: rec._id }, { $set: { used_at: nowIso() } });
    // Revoke all sessions on reset
    await getDB().collection('sessions').updateMany(
      { user_id: rec.user_id, revoked_at: null },
      { $set: { revoked_at: nowIso(), revoke_reason: 'password_reset' } }
    );
    await logAudit(db, { action: 'AUTH_PASSWORD_RESET', user_id: rec.user_id, ip: req.ip });
    res.json({ message: 'Password reset. Please log in again.' });
  });

  router.post('/change-password', mw.authenticateUser(), async (req, res) => {
    const current = String(req.body?.current_password || '');
    const next = String(req.body?.new_password || '');
    const strengthErr = validatePasswordStrength(next);
    if (strengthErr) return res.status(400).json({ error: strengthErr });

    const user = await getDB().collection('users').findOne({ id: req.user.id });
    const ok = await verifyPassword(current, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password incorrect' });

    const passwordHash = await hashPassword(next);
    await getDB().collection('users').updateOne({ id: req.user.id }, {
      $set: { password_hash: passwordHash, updated_at: nowIso() }
    });
    // Revoke all sessions except the current one
    const currentHash = req.cookies?.refresh_token ? sha256(req.cookies.refresh_token) : null;
    await getDB().collection('sessions').updateMany(
      { user_id: req.user.id, revoked_at: null, token_hash: { $ne: currentHash } },
      { $set: { revoked_at: nowIso(), revoke_reason: 'password_change' } }
    );
    await logAudit(db, { action: 'AUTH_PASSWORD_CHANGED', user_id: req.user.id, ip: req.ip });
    res.json({ message: 'Password changed' });
  });

  // ================= ORGANIZATIONS =================
  router.get('/organizations', mw.authenticateUser(), async (req, res) => {
    const memberships = await getDB().collection('organization_memberships').find({
      user_id: req.user.id, status: 'active'
    }).toArray();
    const orgIds = memberships.map(m => m.organization_id);
    const orgs = await getDB().collection('organizations').find({ id: { $in: orgIds } }).toArray();
    res.json(orgs.map(o => {
      const m = memberships.find(x => x.organization_id === o.id);
      return { ...o, role: m?.role, permissions: permissionsForMembership(m) };
    }));
  });

  // ================= MEMBERS =================
  router.get('/members',
    mw.authenticateUser(),
    mw.resolveOrganization(),
    mw.requirePermission('members.manage'),
    async (req, res) => {
      const memberships = await getDB().collection('organization_memberships').find({
        organization_id: req.membership.organization_id
      }).toArray();
      const userIds = memberships.map(m => m.user_id);
      const users = await getDB().collection('users').find(
        { id: { $in: userIds } },
        { projection: { password_hash: 0 } }
      ).toArray();
      res.json(memberships.map(m => ({
        ...m,
        user: users.find(u => u.id === m.user_id),
        permissions: permissionsForMembership(m)
      })));
    });

  router.patch('/members/:userId/role',
    mw.authenticateUser(),
    mw.resolveOrganization(),
    mw.requirePermission('members.manage'),
    async (req, res) => {
      const role = String(req.body?.role || '');
      if (!ROLE_PERMISSIONS[role]) return res.status(400).json({ error: 'Invalid role' });
      // Prevent a non-super-admin from creating super-admins
      if (role === 'super_admin' && req.membership.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super_admin can grant super_admin' });
      }
      const result = await getDB().collection('organization_memberships').updateOne(
        { user_id: req.params.userId, organization_id: req.membership.organization_id },
        { $set: { role, updated_at: nowIso() } }
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: 'Membership not found' });
      await logAudit(db, {
        action: 'MEMBER_ROLE_CHANGED', user_id: req.user.id,
        target_user_id: req.params.userId, organization_id: req.membership.organization_id, new_role: role
      });
      res.json({ message: 'Role updated' });
    });

  // ================= AUDIT LOGS =================
  router.get('/audit-logs',
    mw.authenticateUser(),
    mw.resolveOrganization(),
    mw.requirePermission('audit.read'),
    async (req, res) => {
      const logs = await getDB().collection('audit_logs').find({
        $or: [
          { organization_id: req.membership.organization_id },
          { user_id: req.user.id }
        ]
      }).sort({ timestamp: -1 }).limit(200).toArray();
      res.json(logs.map(({ _id, ...rest }) => rest));
    });

  module.exports = router;

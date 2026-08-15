const { verifyAccessToken } = require('../utils/tokens');
const { membershipHas } = require('../utils/rbac');
const { getDB } = require('../config/db');

function authenticateUser({ optional = false } = {}) {
  return async (req, res, next) => {
    let token = req.cookies?.access_token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7);
    }
    if (!token) {
      if (optional) return next();
      return res.status(401).json({ error: 'Not authenticated' });
    }
    try {
      const db = getDB();
      const decoded = verifyAccessToken(token);
      const user = await db.collection('users').findOne(
        { id: decoded.sub, status: { $ne: 'suspended' } },
        { projection: { password_hash: 0 } }
      );
      if (!user) {
        if (optional) return next();
        return res.status(401).json({ error: 'User not found or suspended' });
      }
      req.user = user;
      req.tokenPayload = decoded;
      return next();
    } catch (err) {
      if (optional) return next();
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

function resolveOrganization({ optional = false } = {}) {
  return async (req, res, next) => {
    if (!req.user) {
      if (optional) return next();
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const requestedOrgId =
      req.header('x-organization-id') ||
      req.query.org ||
      req.user.current_org_id;
    if (!requestedOrgId) {
      if (optional) return next();
      return res.status(400).json({ error: 'No organization selected' });
    }
    const db = getDB();
    const membership = await db.collection('organization_memberships').findOne({
      user_id: req.user.id,
      organization_id: requestedOrgId,
      status: 'active'
    });
    if (!membership) {
      if (optional) return next();
      return res.status(403).json({ error: 'Not a member of this organization' });
    }
    const organization = await db.collection('organizations').findOne({ id: requestedOrgId });
    if (!organization) return res.status(404).json({ error: 'Organization not found' });
    req.membership = membership;
    req.organization = organization;
    return next();
  };
}

function requireOrganizationMember() {
  return (req, res, next) => {
    if (!req.membership) return res.status(403).json({ error: 'Organization membership required' });
    next();
  };
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.membership) return res.status(403).json({ error: 'Organization membership required' });
    if (!membershipHas(req.membership, perm)) {
      return res.status(403).json({ error: `Permission denied: ${perm}` });
    }
    next();
  };
}

function requireVerifiedEmail() {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!req.user.email_verified) return res.status(403).json({ error: 'Email verification required' });
    next();
  };
}

module.exports = { authenticateUser, resolveOrganization, requireOrganizationMember, requirePermission, requireVerifiedEmail };

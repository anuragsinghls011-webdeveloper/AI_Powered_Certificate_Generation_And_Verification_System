// JWT token helpers — access + refresh tokens with issuer/audience/type validation.

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SECRET = () => process.env.JWT_SECRET;
const ISSUER = process.env.JWT_ISSUER || 'campuscert-pro';
const AUDIENCE = process.env.JWT_AUDIENCE || 'campuscert-pro-web';
const ACCESS_TTL = parseInt(process.env.ACCESS_TOKEN_TTL || '900', 10); // 15 min
const REFRESH_TTL = parseInt(process.env.REFRESH_TOKEN_TTL || '604800', 10); // 7 days

function signAccessToken(user, membership) {
  if (!SECRET()) throw new Error('JWT_SECRET is not configured');
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: 'access',
      org: membership?.organization_id || null,
      role: membership?.role || null,
    },
    SECRET(),
    { algorithm: 'HS256', expiresIn: ACCESS_TTL, issuer: ISSUER, audience: AUDIENCE }
  );
}

// Refresh token carries a random jti; we hash it and store as a session record.
function generateRefreshToken(user, sessionId) {
  if (!SECRET()) throw new Error('JWT_SECRET is not configured');
  const jti = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign(
    { sub: user.id, type: 'refresh', sid: sessionId, jti },
    SECRET(),
    { algorithm: 'HS256', expiresIn: REFRESH_TTL, issuer: ISSUER, audience: AUDIENCE }
  );
  return { token, jti };
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, SECRET(), {
    algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE
  });
  if (decoded.type !== 'access') throw new Error('Wrong token type');
  return decoded;
}

function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, SECRET(), {
    algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE
  });
  if (decoded.type !== 'refresh') throw new Error('Wrong token type');
  return decoded;
}

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function randomTokenUrl64() { return crypto.randomBytes(32).toString('hex'); }

module.exports = {
  signAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken,
  sha256, randomTokenUrl64,
  ACCESS_TTL, REFRESH_TTL
};

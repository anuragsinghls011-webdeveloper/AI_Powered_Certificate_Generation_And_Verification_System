// Password hashing helpers — bcryptjs (12 rounds).

const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hashed) {
  if (!hashed) return false;
  return bcrypt.compare(plain, hashed);
}

// Password policy: min 8 chars, one letter + one digit
function validatePasswordStrength(pwd) {
  if (typeof pwd !== 'string') return 'Password required';
  if (pwd.length < 8) return 'Password must be at least 8 characters';
  if (pwd.length > 128) return 'Password too long';
  if (!/[A-Za-z]/.test(pwd)) return 'Password must contain at least one letter';
  if (!/[0-9]/.test(pwd)) return 'Password must contain at least one digit';
  return null;
}

module.exports = { hashPassword, verifyPassword, validatePasswordStrength };

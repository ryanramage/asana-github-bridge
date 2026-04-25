'use strict';

const crypto = require('crypto');

// Verify a GitHub webhook signature.
// Pure function — no I/O, safe to call from tests.
//
// Returns true iff the signature header matches HMAC-SHA256(secret, rawBody).
function verifySignature(secret, rawBody, signatureHeader) {
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { verifySignature };

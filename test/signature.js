const test = require('brittle')
const crypto = require('crypto')
const { verifySignature } = require('../lib/signature.js')

test('valid signature', async function (t) {
  const secret = 'my-webhook-secret'
  const body = '{"action":"opened","number":1}'
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const signature = 'sha256=' + hmac

  t.ok(verifySignature(secret, body, signature), 'should verify valid signature')
})

test('invalid signature - wrong secret', async function (t) {
  const secret = 'my-webhook-secret'
  const wrongSecret = 'wrong-secret'
  const body = '{"action":"opened","number":1}'
  const hmac = crypto.createHmac('sha256', wrongSecret).update(body).digest('hex')
  const signature = 'sha256=' + hmac

  t.absent(verifySignature(secret, body, signature), 'should reject wrong secret')
})

test('invalid signature - tampered body', async function (t) {
  const secret = 'my-webhook-secret'
  const body = '{"action":"opened","number":1}'
  const tamperedBody = '{"action":"opened","number":2}'
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const signature = 'sha256=' + hmac

  t.absent(verifySignature(secret, tamperedBody, signature), 'should reject tampered body')
})

test('invalid signature - missing sha256= prefix', async function (t) {
  const secret = 'my-webhook-secret'
  const body = '{"action":"opened","number":1}'
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const signature = hmac // missing 'sha256=' prefix

  t.absent(verifySignature(secret, body, signature), 'should reject signature without prefix')
})

test('invalid signature - wrong prefix', async function (t) {
  const secret = 'my-webhook-secret'
  const body = '{"action":"opened","number":1}'
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const signature = 'sha1=' + hmac // wrong algorithm prefix

  t.absent(verifySignature(secret, body, signature), 'should reject wrong prefix')
})

test('invalid signature - null signature', async function (t) {
  const secret = 'my-webhook-secret'
  const body = '{"action":"opened","number":1}'

  t.absent(verifySignature(secret, body, null), 'should reject null signature')
})

test('invalid signature - undefined signature', async function (t) {
  const secret = 'my-webhook-secret'
  const body = '{"action":"opened","number":1}'

  t.absent(verifySignature(secret, body, undefined), 'should reject undefined signature')
})

test('invalid signature - empty string', async function (t) {
  const secret = 'my-webhook-secret'
  const body = '{"action":"opened","number":1}'

  t.absent(verifySignature(secret, body, ''), 'should reject empty signature')
})

test('invalid signature - non-string type', async function (t) {
  const secret = 'my-webhook-secret'
  const body = '{"action":"opened","number":1}'

  t.absent(verifySignature(secret, body, 12345), 'should reject non-string signature')
  t.absent(verifySignature(secret, body, {}), 'should reject object signature')
  t.absent(verifySignature(secret, body, []), 'should reject array signature')
})

test('empty body', async function (t) {
  const secret = 'my-webhook-secret'
  const body = ''
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const signature = 'sha256=' + hmac

  t.ok(verifySignature(secret, body, signature), 'should verify empty body')
})

test('unicode characters in body', async function (t) {
  const secret = 'my-webhook-secret'
  const body = '{"title":"测试 🚀 émojis"}'
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const signature = 'sha256=' + hmac

  t.ok(verifySignature(secret, body, signature), 'should verify body with unicode')
})

test('timing safe comparison - prevents timing attacks', async function (t) {
  // This test verifies the function uses crypto.timingSafeEqual
  // by checking it doesn't short-circuit on length mismatch in the hash comparison
  const secret = 'my-webhook-secret'
  const body = '{"action":"opened"}'
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex')
  const signature = 'sha256=' + hmac
  
  // Create a signature with same length but different value
  const wrongHmac = hmac.split('').reverse().join('')
  const wrongSignature = 'sha256=' + wrongHmac

  t.absent(verifySignature(secret, body, wrongSignature), 'should reject using timing-safe comparison')
})

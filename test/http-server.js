const test = require('brittle')
const { EventEmitter } = require('events')
const crypto = require('crypto')
const { createHttpServer } = require('../lib/http-server.js')

// Mock HTTP request
class MockRequest extends EventEmitter {
  constructor(method, url, headers = {}, body = '') {
    super()
    this.method = method
    this.url = url
    this.headers = headers
    this._body = body
    this.socket = null
  }

  // Simulate sending body data
  sendBody() {
    setImmediate(() => {
      if (this._body) {
        this.emit('data', Buffer.from(this._body))
      }
      this.emit('end')
    })
  }

  destroy() {
    this.emit('close')
  }
}

// Mock HTTP response
class MockResponse {
  constructor() {
    this.statusCode = null
    this.headers = {}
    this.body = ''
    this.ended = false
  }

  writeHead(status, headers) {
    this.statusCode = status
    this.headers = headers
  }

  end(body) {
    this.body = body
    this.ended = true
  }
}

// Helper to create a valid GitHub signature
function createSignature(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
}

test('GET /health - returns 200 ok', async function (t) {
  const config = {
    path: '/webhook',
    github: { webhookSecret: 'secret' }
  }
  
  const server = createHttpServer({
    config,
    handlers: {},
    context: {}
  })
  
  const req = new MockRequest('GET', '/health')
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  t.is(res.statusCode, 200, 'should return 200')
  t.is(res.body, 'ok', 'should return ok')
})

test('GET /webhook - returns 404', async function (t) {
  const config = {
    path: '/webhook',
    github: { webhookSecret: 'secret' }
  }
  
  const server = createHttpServer({
    config,
    handlers: {},
    context: {}
  })
  
  const req = new MockRequest('GET', '/webhook')
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  t.is(res.statusCode, 404, 'should return 404')
  t.is(res.body, 'not found', 'should return not found')
})

test('POST /webhook - valid signature and known event', async function (t) {
  t.plan(3)
  
  const body = JSON.stringify({ action: 'opened' })
  const secret = 'my-secret'
  const signature = createSignature(secret, body)
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const handlers = {
    pull_request: async (payload, context) => {
      t.ok(true, 'handler should be called')
      t.alike(payload, { action: 'opened' }, 'should receive payload')
    }
  }
  
  const server = createHttpServer({
    config,
    handlers,
    context: { config }
  })
  
  const req = new MockRequest('POST', '/webhook', {
    'x-github-event': 'pull_request',
    'x-github-delivery': 'test-delivery-123',
    'x-hub-signature-256': signature
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setTimeout(resolve, 10))
  
  t.is(res.statusCode, 202, 'should return 202 accepted')
})

test('POST /webhook - invalid signature returns 401', async function (t) {
  const body = JSON.stringify({ action: 'opened' })
  const secret = 'my-secret'
  const wrongSignature = 'sha256=wrongsignature'
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const handlers = {
    pull_request: async (payload) => {
      t.fail('handler should not be called')
    }
  }
  
  const server = createHttpServer({
    config,
    handlers,
    context: {}
  })
  
  const req = new MockRequest('POST', '/webhook', {
    'x-github-event': 'pull_request',
    'x-github-delivery': 'test-delivery-123',
    'x-hub-signature-256': wrongSignature
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  t.is(res.statusCode, 401, 'should return 401')
  t.is(res.body, 'invalid signature', 'should return invalid signature')
})

test('POST /webhook - invalid JSON returns 400', async function (t) {
  const body = '{ invalid json }'
  const secret = 'my-secret'
  const signature = createSignature(secret, body)
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const server = createHttpServer({
    config,
    handlers: {},
    context: {}
  })
  
  const req = new MockRequest('POST', '/webhook', {
    'x-github-event': 'pull_request',
    'x-github-delivery': 'test-delivery-123',
    'x-hub-signature-256': signature
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  t.is(res.statusCode, 400, 'should return 400')
  t.is(res.body, 'invalid json', 'should return invalid json')
})

test('POST /webhook - unknown event returns 202', async function (t) {
  const body = JSON.stringify({ action: 'opened' })
  const secret = 'my-secret'
  const signature = createSignature(secret, body)
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const handlers = {
    pull_request: async () => {}
  }
  
  const server = createHttpServer({
    config,
    handlers,
    context: {}
  })
  
  const req = new MockRequest('POST', '/webhook', {
    'x-github-event': 'unknown_event',
    'x-github-delivery': 'test-delivery-123',
    'x-hub-signature-256': signature
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  t.is(res.statusCode, 202, 'should return 202 accepted')
})

test('POST /webhook - custom webhook path', async function (t) {
  const body = JSON.stringify({ action: 'opened' })
  const secret = 'my-secret'
  const signature = createSignature(secret, body)
  
  const config = {
    path: '/custom-webhook',
    github: { webhookSecret: secret }
  }
  
  const handlers = {
    pull_request: async () => {}
  }
  
  const server = createHttpServer({
    config,
    handlers,
    context: {}
  })
  
  const req = new MockRequest('POST', '/custom-webhook', {
    'x-github-event': 'pull_request',
    'x-github-delivery': 'test-delivery-123',
    'x-hub-signature-256': signature
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  t.is(res.statusCode, 202, 'should accept custom webhook path')
})

test('POST /wrong-path - returns 404', async function (t) {
  const body = JSON.stringify({ action: 'opened' })
  const secret = 'my-secret'
  const signature = createSignature(secret, body)
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const server = createHttpServer({
    config,
    handlers: {},
    context: {}
  })
  
  const req = new MockRequest('POST', '/wrong-path', {
    'x-github-event': 'pull_request',
    'x-hub-signature-256': signature
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  t.is(res.statusCode, 404, 'should return 404')
})

test('POST /webhook - body size limit exceeded', async function (t) {
  // Create a body larger than 25MB
  const largeBody = 'x'.repeat(26 * 1024 * 1024)
  const secret = 'my-secret'
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const server = createHttpServer({
    config,
    handlers: {},
    context: {}
  })
  
  const req = new MockRequest('POST', '/webhook', {
    'x-github-event': 'pull_request',
    'x-hub-signature-256': 'sha256=test'
  }, largeBody)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  t.is(res.statusCode, 413, 'should return 413')
  t.ok(res.body.includes('payload too large'), 'should mention payload too large')
})

test('POST /webhook - handler throws sync error', async function (t) {
  const body = JSON.stringify({ action: 'opened' })
  const secret = 'my-secret'
  const signature = createSignature(secret, body)
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const handlers = {
    pull_request: (payload, context) => {
      throw new Error('Sync error in handler')
    }
  }
  
  const server = createHttpServer({
    config,
    handlers,
    context: {}
  })
  
  const req = new MockRequest('POST', '/webhook', {
    'x-github-event': 'pull_request',
    'x-github-delivery': 'test-delivery-123',
    'x-hub-signature-256': signature
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  // Should still return 202 because handler is fire-and-forget
  t.is(res.statusCode, 202, 'should return 202 even with handler error')
})

test('POST /webhook - handler throws async error', async function (t) {
  const body = JSON.stringify({ action: 'opened' })
  const secret = 'my-secret'
  const signature = createSignature(secret, body)
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const handlers = {
    pull_request: async (payload, context) => {
      throw new Error('Async error in handler')
    }
  }
  
  const server = createHttpServer({
    config,
    handlers,
    context: {}
  })
  
  const req = new MockRequest('POST', '/webhook', {
    'x-github-event': 'pull_request',
    'x-github-delivery': 'test-delivery-123',
    'x-hub-signature-256': signature
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setTimeout(resolve, 10))
  
  // Should still return 202 because handler is fire-and-forget
  t.is(res.statusCode, 202, 'should return 202 even with async handler error')
})

test('POST /webhook - missing signature header', async function (t) {
  const body = JSON.stringify({ action: 'opened' })
  const secret = 'my-secret'
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const server = createHttpServer({
    config,
    handlers: {},
    context: {}
  })
  
  const req = new MockRequest('POST', '/webhook', {
    'x-github-event': 'pull_request',
    'x-github-delivery': 'test-delivery-123'
    // no x-hub-signature-256 header
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  t.is(res.statusCode, 401, 'should return 401 for missing signature')
})

test('POST /webhook - empty body with valid signature', async function (t) {
  const body = ''
  const secret = 'my-secret'
  const signature = createSignature(secret, body)
  
  const config = {
    path: '/webhook',
    github: { webhookSecret: secret }
  }
  
  const server = createHttpServer({
    config,
    handlers: {},
    context: {}
  })
  
  const req = new MockRequest('POST', '/webhook', {
    'x-github-event': 'pull_request',
    'x-github-delivery': 'test-delivery-123',
    'x-hub-signature-256': signature
  }, body)
  const res = new MockResponse()
  
  server.emit('request', req, res)
  req.sendBody()
  
  await new Promise(resolve => setImmediate(resolve))
  
  // Empty body will fail JSON parsing
  t.is(res.statusCode, 400, 'should return 400 for invalid JSON')
})

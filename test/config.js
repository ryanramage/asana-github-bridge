const test = require('brittle')
const fs = require('fs')
const path = require('path')
const { loadConfig, parseConfig } = require('../lib/config.js')

test('parseConfig - minimal valid config', async function (t) {
  const input = {
    github: {
      webhookSecret: 'my-secret'
    }
  }

  const result = parseConfig(input)
  t.is(result.path, '/webhook', 'default webhook path')
  t.is(result.seed, null, 'no seed buffer')
  t.is(result.acceptUnknownEvents, true, 'acceptUnknownEvents defaults to true')
  t.is(result.github.webhookSecret, 'my-secret', 'webhook secret')
  t.is(result.asana.token, '', 'empty asana token')
  t.is(result.asana.apiBase, 'https://app.asana.com/api/1.0', 'default api base')
  t.is(result.asana.prUrlFieldGid, '', 'empty prUrlFieldGid')
  t.is(result.asana.prUrlFieldName, 'GH PR', 'default prUrlFieldName')
  t.is(result.asana.prMergedFieldGid, '', 'empty prMergedFieldGid')
  t.is(result.asana.prMergedFieldName, 'merged', 'default prMergedFieldName')
  t.is(result.asana.prMergedEnumValue, 'Yes', 'default prMergedEnumValue')
})

test('parseConfig - acceptUnknownEvents defaults to true', async function (t) {
  const result = parseConfig({
    github: { webhookSecret: 'my-secret' }
  })
  t.is(result.acceptUnknownEvents, true, 'omitted -> true')
})

test('parseConfig - acceptUnknownEvents explicit true', async function (t) {
  const result = parseConfig({
    acceptUnknownEvents: true,
    github: { webhookSecret: 'my-secret' }
  })
  t.is(result.acceptUnknownEvents, true, 'explicit true is preserved')
})

test('parseConfig - acceptUnknownEvents explicit false', async function (t) {
  const result = parseConfig({
    acceptUnknownEvents: false,
    github: { webhookSecret: 'my-secret' }
  })
  t.is(result.acceptUnknownEvents, false, 'explicit false is preserved')
})

test('parseConfig - acceptUnknownEvents only false disables (other falsy values default to true)', async function (t) {
  // Be strict: only explicit boolean false flips it. This avoids accidental
  // disablement from typos like 0 / "" / null in handwritten JSON.
  const r1 = parseConfig({
    acceptUnknownEvents: 0,
    github: { webhookSecret: 'my-secret' }
  })
  t.is(r1.acceptUnknownEvents, true, '0 does not disable')

  const r2 = parseConfig({
    acceptUnknownEvents: null,
    github: { webhookSecret: 'my-secret' }
  })
  t.is(r2.acceptUnknownEvents, true, 'null does not disable')
})

test('parseConfig - custom webhook path', async function (t) {
  const input = {
    path: '/custom-webhook',
    github: {
      webhookSecret: 'my-secret'
    }
  }

  const result = parseConfig(input)
  t.is(result.path, '/custom-webhook', 'custom webhook path')
})

test('parseConfig - valid seed', async function (t) {
  const input = {
    seed: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    github: {
      webhookSecret: 'my-secret'
    }
  }

  const result = parseConfig(input)
  t.ok(Buffer.isBuffer(result.seed), 'seed is a buffer')
  t.is(result.seed.length, 32, 'seed is 32 bytes')
  t.is(result.seed.toString('hex'), '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'seed matches')
})

test('parseConfig - seed with uppercase hex', async function (t) {
  const input = {
    seed: 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789',
    github: {
      webhookSecret: 'my-secret'
    }
  }

  const result = parseConfig(input)
  t.ok(Buffer.isBuffer(result.seed), 'seed is a buffer')
  t.is(result.seed.toString('hex'), 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789', 'seed converted to lowercase')
})

test('parseConfig - empty seed string', async function (t) {
  const input = {
    seed: '',
    github: {
      webhookSecret: 'my-secret'
    }
  }

  const result = parseConfig(input)
  t.is(result.seed, null, 'empty seed results in null')
})

test('parseConfig - missing seed', async function (t) {
  const input = {
    github: {
      webhookSecret: 'my-secret'
    }
  }

  const result = parseConfig(input)
  t.is(result.seed, null, 'missing seed results in null')
})

test('parseConfig - invalid seed - too short', async function (t) {
  const input = {
    seed: '0123456789abcdef',
    github: {
      webhookSecret: 'my-secret'
    }
  }

  t.exception(() => parseConfig(input), /must be a 64-character hex string/)
})

test('parseConfig - invalid seed - too long', async function (t) {
  const input = {
    seed: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00',
    github: {
      webhookSecret: 'my-secret'
    }
  }

  t.exception(() => parseConfig(input), /must be a 64-character hex string/)
})

test('parseConfig - invalid seed - non-hex characters', async function (t) {
  const input = {
    seed: 'gggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggggg',
    github: {
      webhookSecret: 'my-secret'
    }
  }

  t.exception(() => parseConfig(input), /must be a 64-character hex string/)
})

test('parseConfig - missing github.webhookSecret', async function (t) {
  const input = {}

  t.exception(() => parseConfig(input), /webhookSecret is required/)
})

test('parseConfig - empty github.webhookSecret', async function (t) {
  const input = {
    github: {
      webhookSecret: ''
    }
  }

  t.exception(() => parseConfig(input), /webhookSecret is required/)
})

test('parseConfig - missing github object', async function (t) {
  const input = {}

  t.exception(() => parseConfig(input), /webhookSecret is required/)
})

test('parseConfig - full asana config', async function (t) {
  const input = {
    github: {
      webhookSecret: 'my-secret'
    },
    asana: {
      token: 'asana-token-123',
      apiBase: 'https://custom.asana.com/api/1.0',
      prUrlFieldGid: '1234567890',
      prUrlFieldName: 'PR Link',
      prMergedFieldGid: '0987654321',
      prMergedFieldName: 'merged_status',
      prMergedEnumValue: 'Merged'
    }
  }

  const result = parseConfig(input)
  t.is(result.asana.token, 'asana-token-123', 'asana token')
  t.is(result.asana.apiBase, 'https://custom.asana.com/api/1.0', 'custom api base')
  t.is(result.asana.prUrlFieldGid, '1234567890', 'prUrlFieldGid')
  t.is(result.asana.prUrlFieldName, 'PR Link', 'prUrlFieldName')
  t.is(result.asana.prMergedFieldGid, '0987654321', 'prMergedFieldGid')
  t.is(result.asana.prMergedFieldName, 'merged_status', 'prMergedFieldName')
  t.is(result.asana.prMergedEnumValue, 'Merged', 'prMergedEnumValue')
})

test('parseConfig - asana token with "replace-with" prefix ignored', async function (t) {
  const input = {
    github: {
      webhookSecret: 'my-secret'
    },
    asana: {
      token: 'replace-with-your-token'
    }
  }

  const result = parseConfig(input)
  t.is(result.asana.token, '', 'token with replace-with prefix is ignored')
})

test('parseConfig - missing asana object', async function (t) {
  const input = {
    github: {
      webhookSecret: 'my-secret'
    }
  }

  const result = parseConfig(input)
  t.is(result.asana.token, '', 'empty asana token')
  t.is(result.asana.apiBase, 'https://app.asana.com/api/1.0', 'default api base')
})

test('loadConfig - valid config file', async function (t) {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'config-test-'))
  const configPath = path.join(tmpDir, 'test-config.json')
  
  const configData = {
    github: {
      webhookSecret: 'test-secret'
    },
    asana: {
      token: 'test-token'
    }
  }
  
  fs.writeFileSync(configPath, JSON.stringify(configData))
  
  try {
    const result = loadConfig(configPath)
    t.is(result.github.webhookSecret, 'test-secret', 'loaded webhook secret')
    t.is(result.asana.token, 'test-token', 'loaded asana token')
  } finally {
    fs.rmSync(tmpDir, { recursive: true })
  }
})

test('loadConfig - missing config file', async function (t) {
  const nonExistentPath = '/tmp/this-file-does-not-exist-' + Date.now() + '.json'
  
  t.exception(() => loadConfig(nonExistentPath), /Missing config file/)
})

test('loadConfig - invalid JSON', async function (t) {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'config-test-'))
  const configPath = path.join(tmpDir, 'invalid.json')
  
  fs.writeFileSync(configPath, '{ invalid json }')
  
  try {
    t.exception(() => loadConfig(configPath), /Invalid JSON/)
  } finally {
    fs.rmSync(tmpDir, { recursive: true })
  }
})

test('loadConfig - config with invalid seed', async function (t) {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'config-test-'))
  const configPath = path.join(tmpDir, 'bad-seed.json')
  
  const configData = {
    seed: 'short',
    github: {
      webhookSecret: 'test-secret'
    }
  }
  
  fs.writeFileSync(configPath, JSON.stringify(configData))
  
  try {
    t.exception(() => loadConfig(configPath), /must be a 64-character hex string/)
  } finally {
    fs.rmSync(tmpDir, { recursive: true })
  }
})

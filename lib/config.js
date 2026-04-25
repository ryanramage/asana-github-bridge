'use strict';

const fs = require('fs');

// Load + validate a bridge config file.
//
// Throws on any problem. The entry point is responsible for logging and
// exiting; this module stays pure so tests can just assert on the thrown
// error or the returned shape.
function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing config file at ${configPath}. Copy config.example.json to config.json and fill it in.`
    );
  }

  const raw = fs.readFileSync(configPath, 'utf8');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in config file at ${configPath}: ${err.message}`);
  }

  return parseConfig(parsed);
}

// Separate from loadConfig so tests can feed an already-parsed object.
function parseConfig(parsed) {
  const webhookPath = parsed.path || '/webhook';

  // seed, if provided, must be 64 hex chars (32 bytes). Empty string / missing
  // means "generate an ephemeral keypair".
  let seedBuf = null;
  if (typeof parsed.seed === 'string' && parsed.seed.length > 0) {
    if (!/^[0-9a-fA-F]{64}$/.test(parsed.seed)) {
      throw new Error(
        'config.seed must be a 64-character hex string (32 bytes). ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    seedBuf = Buffer.from(parsed.seed, 'hex');
  }

  const githubWebhookSecret =
    (parsed.github && parsed.github.webhookSecret) || '';
  if (!githubWebhookSecret) {
    throw new Error(
      'config.github.webhookSecret is required for signature verification.'
    );
  }

  const asanaIn = parsed.asana || {};
  const asanaToken =
    typeof asanaIn.token === 'string' &&
    asanaIn.token &&
    !asanaIn.token.startsWith('replace-with')
      ? asanaIn.token
      : '';
  const asana = {
    token: asanaToken,
    apiBase: asanaIn.apiBase || 'https://app.asana.com/api/1.0',
    prUrlFieldGid: asanaIn.prUrlFieldGid || '',
    prUrlFieldName: asanaIn.prUrlFieldName || 'GH PR',
    prMergedFieldGid: asanaIn.prMergedFieldGid || '',
    prMergedFieldName: asanaIn.prMergedFieldName || 'merged',
    prMergedEnumValue: asanaIn.prMergedEnumValue || 'Yes'
  };

  return {
    path: webhookPath,
    seed: seedBuf,
    github: { webhookSecret: githubWebhookSecret },
    asana
  };
}

module.exports = { loadConfig, parseConfig };

'use strict';

const http = require('http');
const idEnc = require('hypercore-id-encoding');

const { verifySignature } = require('./signature');

// Create an http.Server for the webhook bridge.
//
// Deps are injected so tests can pass fake handlers / context / config.
//   createHttpServer({
//     config,         // from ./config
//     handlers,       // map: { [event]: async (payload, context) => ... }
//     context         // { config, asanaClient, log, ... } passed to handlers
//   })
//
// The returned server is *not* listening — the caller decides how to bind it
// (TCP, unix socket, or — in our case — fed by a DHT server).
function createHttpServer({ config, handlers, context }) {
  return http.createServer(async (req, res) => {
    try {
      // Health check
      if (req.method === 'GET' && req.url === '/health') {
        return send(res, 200, 'ok');
      }

      // Only the configured webhook path accepts POSTs.
      if (req.method !== 'POST' || req.url !== config.path) {
        return send(res, 404, 'not found');
      }

      let rawBody;
      try {
        rawBody = await readRawBody(req);
      } catch (err) {
        return send(res, 413, `bad request: ${err.message}`);
      }

      const event = req.headers['x-github-event'];
      const delivery = req.headers['x-github-delivery'];
      const peerKey = remotePeerKey(req);

      const signature = req.headers['x-hub-signature-256'];
      if (!verifySignature(config.github.webhookSecret, rawBody, signature)) {
        console.warn(
          `[webhook] rejected: invalid signature delivery=${delivery || 'n/a'} peer=${peerKey || 'n/a'}`
        );
        return send(res, 401, 'invalid signature');
      }

      let payload;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch (err) {
        console.warn(
          `[webhook] bad json for delivery ${delivery}: ${err.message}`
        );
        return send(res, 400, 'invalid json');
      }

      console.log(`[webhook] event=${event} delivery=${delivery}`);

      const handler = handlers[event];
      if (!handler) {
        // No registered handler. By default we accept so GitHub marks the
        // delivery green — orgs commonly tick "Send me everything" and
        // we don't want star.created / watch.started / etc. flooding the
        // webhook UI with red. Operators can flip acceptUnknownEvents:false
        // in config to surface unhandled events as 404s instead.
        if (config.acceptUnknownEvents !== false) {
          console.log(`[webhook] ignoring event=${event}`);
          return send(res, 200, 'ok');
        }
        console.log(`[webhook] no handler for event=${event}`);
        return send(res, 404, 'no handler for event');
      }

      // Fire-and-forget: respond 202 immediately. Any async errors from the
      // handler are caught here so they don't crash the process.
      dispatchHandler(event, handler, payload, context);
      return send(res, 202, 'accepted');
    } catch (err) {
      // Should never happen — dispatchHandler catches its own errors — but
      // belt-and-braces for anything synchronous above.
      console.error('[webhook] unexpected server error:', err);
      try {
        return send(res, 500, 'internal error');
      } catch (_) {
        /* response may already be sent */
      }
    }
  });
}

function dispatchHandler(event, handler, payload, context) {
  let result;
  try {
    result = handler(payload, context);
  } catch (err) {
    if (context.noConsoleError) return
    console.error(`[webhook] sync error in handler event=${event}:`, err);
    return;
  }
  if (result && typeof result.then === 'function') {
    result.catch((err) => {
      if (context.noConsoleError) return
      console.error(`[webhook] async error in handler event=${event}:`, err);
    });
  }
}

function readRawBody(req, limitBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

// Over DHT, req.socket is a NoiseSecretStream carrying the peer's public key.
// Over plain TCP this will be undefined and we fall back to null.
function remotePeerKey(req) {
  if (req.socket && req.socket.remotePublicKey) {
    return idEnc.normalize(req.socket.remotePublicKey);
  }
  return null;
}

module.exports = { createHttpServer };

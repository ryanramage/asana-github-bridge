"use strict";

// Entry point: wires config + modules together. No business logic lives here.
//
// Module layout (see each file for details):
//   config.js          loadConfig(path)
//   signature.js       verifySignature(secret, body, header)
//   asana-links.js     extractAsanaTasks(text)
//   asana.js           createAsanaClient, syncPrToTask
//   handlers/          one file per GitHub event type
//   http-server.js     createHttpServer({ config, handlers, context })
//   dht-server.js      createDhtServer({ httpServer, keyPair })

const path = require("path");
const DHT = require("hyperdht");
const idEnc = require("hypercore-id-encoding");

const { loadConfig } = require("./lib/config");
const { createAsanaClient } = require("./lib/asana");
const { createHttpServer } = require("./lib/http-server");
const { createDhtServer } = require("./lib/dht-server");
const handlers = require("./handlers");

// --- config ------------------------------------------------------------
const CONFIG_PATH = process.env.CONFIG_PATH
  ? path.resolve(process.env.CONFIG_PATH)
  : path.join(__dirname, "config.json");

let config;
try {
  config = loadConfig(CONFIG_PATH);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

// --- shared context for handlers --------------------------------------
const asanaClient = createAsanaClient({
  token: config.asana.token,
  apiBase: config.asana.apiBase,
});
if (!asanaClient) {
  console.warn(
    "[asana] no token configured; Asana task updates will be skipped (dry-run logging only).",
  );
}

const context = { config, asanaClient, log: console };

// --- http (not listening on a port; fed by the DHT) -------------------
const httpServer = createHttpServer({ config, handlers, context });

// --- dht binding -------------------------------------------------------
const keyPair = DHT.keyPair(config.seed || undefined);
const dhtServer = createDhtServer({ httpServer, keyPair });

dhtServer.listen().then(() => {
  console.log(
    `github-asana-bridge listening https://${idEnc.normalize(keyPair.publicKey)}.hyperproxy.org${config.path}`,
  );
});

// --- shutdown ----------------------------------------------------------
let shuttingDown = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${sig}, shutting down...`);
    const hardExit = setTimeout(() => process.exit(1), 5000).unref();
    try {
      await dhtServer.close();
      httpServer.close();
    } catch (err) {
      console.warn("Error during shutdown:", err);
    }
    clearTimeout(hardExit);
    process.exit(0);
  });
}

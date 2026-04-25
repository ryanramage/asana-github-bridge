'use strict';

const DHT = require('hyperdht');

// Bind an http.Server to the Hyper DHT.
//
// Instead of a TCP port, we accept connections over the DHT and hand them
// to the HTTP server via `httpServer.emit('connection', conn)`. The
// http-dht-proxy (https://github.com/holepunchto/http-dht-proxy) is what
// GitHub POSTs to — it forwards the HTTP stream over this DHT connection.
//
//   createDhtServer({ httpServer, keyPair })
//     -> { dht, server, publicKey, listen(), close() }
//
// listen() resolves when the DHT server is announcing.
// close() gracefully shuts everything down.
function createDhtServer({ httpServer, keyPair }) {
  const dht = new DHT();

  const server = dht.createServer((conn) => {
    conn.on('error', (err) => {
      if (
        err.code === 'ECONNRESET' ||
        err.message === 'Writable stream closed prematurely'
      ) {
        return;
      }
      console.warn('DHT error:', err);
    });
    httpServer.emit('connection', conn);
  });

  return {
    dht,
    server,
    publicKey: keyPair.publicKey,
    listen() {
      return server.listen(keyPair);
    },
    async close() {
      await server.close();
      await dht.destroy();
    }
  };
}

module.exports = { createDhtServer };

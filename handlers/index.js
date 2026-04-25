'use strict';

// GitHub webhook event -> handler function.
//
// Handler contract:
//   async function handler(payload, context) { ... }
//   context = { config, asanaClient, log }
//
// The HTTP layer dispatches by looking up `req.headers['x-github-event']`
// in this map. Unknown events are accepted (HTTP 202) and logged.
//
// To add a new event type:
//   1. Create handlers/<event>.js exporting an async function.
//   2. Add one line below: <event>: require('./<event>').
module.exports = {
  ping: require('./ping'),
  pull_request: require('./pull_request')
};

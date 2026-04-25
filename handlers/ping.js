'use strict';

// Handler for GitHub's `ping` event (fired when a webhook is created/re-sent).
//
// Signature: async (payload, context) => void
//   context = { config, asanaClient, log }
//
// Returning a promise is fine; the HTTP dispatcher fires and forgets.
module.exports = async function handlePing(payload /*, context */) {
  const org =
    (payload.organization && payload.organization.login) || 'n/a';
  console.log(
    `[ping] zen="${payload.zen}" hookId=${payload.hook_id} org=${org}`
  );
};

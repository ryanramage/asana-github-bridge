'use strict';

const { extractAsanaTasks } = require('../lib/asana-links');
const { syncPrToTask } = require('../lib/asana');

// Handler for GitHub `pull_request` events.
//
// 1. Logs the PR summary.
// 2. Extracts Asana task references from the PR body.
// 3. For each task, syncs the PR URL + merged-status custom fields.
//
// Fire-and-forget at the HTTP layer, but this function still returns a
// Promise that resolves once all per-task syncs have settled — so tests
// can await it.
module.exports = async function handlePullRequest(payload, context) {
  const { config, asanaClient } = context;

  const action = payload.action;
  const pr = payload.pull_request || {};
  const repo =
    (payload.repository && payload.repository.full_name) || 'unknown';

  const status = prStatus(pr);
  const asanaTasks = extractAsanaTasks(pr.body);

  console.log(
    `[pull_request] repo=${repo} action=${action} #${pr.number} status=${status} ` +
      `url=${pr.html_url} asanaTasks=${JSON.stringify(asanaTasks)}`
  );

  if (asanaTasks.length === 0) return;

  if (!asanaClient) {
    console.log(
      `[asana] dry-run: would sync ${asanaTasks.length} task(s) for PR ${pr.html_url} (status=${status})`
    );
    return;
  }

  // Run per-task syncs in parallel. Each settles independently so one
  // failure doesn't stop the others.
  await Promise.all(
    asanaTasks.map((task) =>
      syncPrToTask(asanaClient, task, pr.html_url, status, config.asana)
        .then((result) => {
          console.log(
            `[asana] task=${result.taskId} name=${JSON.stringify(result.taskName)} ` +
              `url[${result.urlField.field}]=${result.urlField.action}` +
              `(${result.urlField.reason || result.urlField.value || ''}) ` +
              `merged[${result.mergedField.field}]=${result.mergedField.action}` +
              `(${result.mergedField.reason || result.mergedField.value || ''})`
          );
        })
        .catch((err) => {
          if (context.noConsoleError) return 
          console.error(
            `[asana] sync failed task=${task.taskId} pr=${pr.html_url}: ${err.message}`
          );
        })
    )
  );
};

// Exported for tests.
function prStatus(pr) {
  if (pr.merged) return 'merged';
  if (pr.state === 'closed') return 'closed';
  return 'open';
}

module.exports.prStatus = prStatus;

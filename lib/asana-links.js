'use strict';

// Extract Asana task references from free-form text (typically a PR body).
//
// Pure function. Handles two URL shapes that Asana produces:
//
//   New: https://app.asana.com/1/<workspace_gid>/project/<project_gid>/task/<task_gid>[?...]
//   Old: https://app.asana.com/0/<project_gid>/<task_gid>[/f][?...]
//
// Returns an array of { workspaceId, projectId, taskId }. The old format
// does not carry the workspace gid, so `workspaceId` will be null there.
// Dedup is by `taskId` — the first occurrence wins (new-format is checked
// first so the richer record is preferred).

const ASANA_NEW_RE =
  /https?:\/\/app\.asana\.com\/1\/(\d+)\/project\/(\d+)\/task\/(\d+)/gi;
const ASANA_OLD_RE = /https?:\/\/app\.asana\.com\/0\/(\d+)\/(\d+)/gi;

function extractAsanaTasks(text) {
  if (!text || typeof text !== 'string') return [];

  const seen = new Set();
  const tasks = [];

  function push(task) {
    if (seen.has(task.taskId)) return;
    seen.add(task.taskId);
    tasks.push(task);
  }

  let m;
  while ((m = ASANA_NEW_RE.exec(text)) !== null) {
    push({ workspaceId: m[1], projectId: m[2], taskId: m[3] });
  }
  while ((m = ASANA_OLD_RE.exec(text)) !== null) {
    push({ workspaceId: null, projectId: m[1], taskId: m[2] });
  }

  return tasks;
}

module.exports = { extractAsanaTasks };

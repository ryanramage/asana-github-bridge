'use strict';

// Minimal Asana REST client + PR sync logic.
//
// Docs: https://developers.asana.com/docs
//
// We do not pull in an SDK; a thin fetch wrapper keeps deps minimal and
// the surface area obvious.

function createAsanaClient({ token, apiBase }) {
  if (!token) return null;

  async function request(method, path, body) {
    const url = `${apiBase}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (_) {
        /* non-JSON error body */
      }
    }

    if (!res.ok) {
      const err = new Error(
        `Asana ${method} ${path} failed: ${res.status} ${res.statusText}` +
          (text ? ` body=${text.slice(0, 500)}` : '')
      );
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }

  return {
    // GET /tasks/{task_gid}
    //
    // Asana returns a *compact* custom_fields object unless you enumerate
    // each subfield you want. Omit any of these and you'll get undefined
    // for things like `type` / `text_value`.
    getTask(taskId) {
      const optFields = [
        'name',
        'custom_fields.gid',
        'custom_fields.name',
        'custom_fields.type',
        'custom_fields.resource_subtype',
        'custom_fields.text_value',
        'custom_fields.enum_value',
        'custom_fields.enum_value.gid',
        'custom_fields.enum_value.name',
        'custom_fields.enum_options',
        'custom_fields.enum_options.gid',
        'custom_fields.enum_options.name'
      ].join(',');
      const params = new URLSearchParams({ opt_fields: optFields });
      return request('GET', `/tasks/${taskId}?${params}`);
    },
    // PUT /tasks/{task_gid}
    updateTaskCustomFields(taskId, customFields) {
      return request('PUT', `/tasks/${taskId}`, {
        data: { custom_fields: customFields }
      });
    }
  };
}

// Gid match is preferred (stable across renames). Name is a fallback so the
// bridge still works if gids aren't filled in yet.
function findField(customFields, gid, name) {
  if (!Array.isArray(customFields)) return null;
  if (gid) {
    const byGid = customFields.find((f) => f && f.gid === gid);
    if (byGid) return byGid;
  }
  if (name) {
    return customFields.find((f) => f && f.name === name) || null;
  }
  return null;
}

function fieldLabel(gid, name) {
  if (gid && name) return `${name} (gid=${gid})`;
  if (gid) return `gid=${gid}`;
  return name || '<unnamed>';
}

// Apply PR-related updates to a single Asana task.
//
// Rules (per user decisions):
//   - If `PR` field is empty, set it to `prUrl`. If already set to anything
//     else (even a different PR URL), leave it alone.
//   - If `status === 'merged'` and `PR Merged` enum is not already the
//     configured value, set it to that enum option.
//   - `PR Merged` is never cleared.
//
// Returns an object describing what, if anything, was changed.
async function syncPrToTask(client, task, prUrl, status, opts) {
  const {
    prUrlFieldGid,
    prUrlFieldName,
    prMergedFieldGid,
    prMergedFieldName,
    prMergedEnumValue
  } = opts;

  const urlLabel = fieldLabel(prUrlFieldGid, prUrlFieldName);
  const mergedLabel = fieldLabel(prMergedFieldGid, prMergedFieldName);

  const fetched = await client.getTask(task.taskId);
  const customFields = (fetched && fetched.data && fetched.data.custom_fields) || [];

  const urlField = findField(customFields, prUrlFieldGid, prUrlFieldName);
  const mergedField = findField(customFields, prMergedFieldGid, prMergedFieldName);

  const updates = {};
  const result = {
    taskId: task.taskId,
    taskName: (fetched && fetched.data && fetched.data.name) || null,
    urlField: { field: urlLabel, action: 'skip', reason: 'no change' },
    mergedField: { field: mergedLabel, action: 'skip', reason: 'no change' }
  };

  // --- PR URL field (text) ---
  const urlFieldType = urlField && (urlField.type || urlField.resource_subtype);
  if (!urlField) {
    result.urlField = {
      field: urlLabel,
      action: 'skip',
      reason: 'field not found on task'
    };
  } else if (urlFieldType !== 'text') {
    result.urlField = {
      field: urlLabel,
      action: 'skip',
      reason: `expected type=text, got type=${urlFieldType}`
    };
  } else {
    const current = (urlField.text_value || '').trim();
    if (current === '') {
      updates[urlField.gid] = prUrl;
      result.urlField = { field: urlLabel, action: 'set', value: prUrl };
    } else if (current === prUrl) {
      result.urlField = {
        field: urlLabel,
        action: 'skip',
        reason: 'already set to this PR'
      };
    } else {
      result.urlField = {
        field: urlLabel,
        action: 'skip',
        reason: `already set to a different value (${current})`
      };
    }
  }

  // --- PR Merged field (enum) — only touch when status === 'merged' ---
  if (status !== 'merged') {
    result.mergedField = {
      field: mergedLabel,
      action: 'skip',
      reason: `status=${status}, not merged`
    };
  } else if (!mergedField) {
    result.mergedField = {
      field: mergedLabel,
      action: 'skip',
      reason: 'field not found on task'
    };
  } else if (
    (mergedField.type || mergedField.resource_subtype) !== 'enum'
  ) {
    const t = mergedField.type || mergedField.resource_subtype;
    result.mergedField = {
      field: mergedLabel,
      action: 'skip',
      reason: `expected type=enum, got type=${t}`
    };
  } else {
    const option = (mergedField.enum_options || []).find(
      (o) => o && o.name === prMergedEnumValue
    );
    if (!option) {
      result.mergedField = {
        field: mergedLabel,
        action: 'skip',
        reason: `enum option "${prMergedEnumValue}" not defined on field`
      };
    } else {
      const currentGid =
        mergedField.enum_value && mergedField.enum_value.gid
          ? mergedField.enum_value.gid
          : null;
      if (currentGid === option.gid) {
        result.mergedField = {
          field: mergedLabel,
          action: 'skip',
          reason: `already set to "${prMergedEnumValue}"`
        };
      } else {
        updates[mergedField.gid] = option.gid;
        result.mergedField = {
          field: mergedLabel,
          action: 'set',
          value: prMergedEnumValue
        };
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    await client.updateTaskCustomFields(task.taskId, updates);
  }

  return result;
}

module.exports = { createAsanaClient, syncPrToTask };

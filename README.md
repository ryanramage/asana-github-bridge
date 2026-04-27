# github-asana-bridge

A small Node.js service that receives GitHub organization webhooks and reflects
the relevant changes into Asana tasks (e.g. setting the PR URL custom field and
flipping a "merged" enum when a PR lands).

Instead of binding to a public TCP port, the bridge listens on the
[Hyper DHT](https://github.com/holepunchto/hyperdht). GitHub talks to it via
[`http-dht-proxy`](https://github.com/holepunchto/http-dht-proxy), so you don't
need to open inbound firewall rules or run a reverse proxy on the host that
runs the bridge.

```
   GitHub webhook ──HTTPS──> http-dht-proxy ──DHT──> github-asana-bridge ──HTTPS──> Asana API
```

---

## Install

Requires Node.js 18+ (uses the global `fetch`).

```sh
git clone https://github.com/ryanramage/github-asana-bridge.git
cd github-asana-bridge
npm install
cp config.example.json config.json
npm run gen-seed              # see "Generating a stable seed" below
# edit config.json (see Configuration)
npm start
```

### Generating a stable seed

The bridge derives its DHT key pair from `config.seed`. If you leave it
empty, every restart produces a fresh DHT public key — meaning you'd
have to reconfigure `http-dht-proxy` (and the GitHub webhook URL) each
time the bridge restarts.

Generate a 32-byte seed once and paste the hex output into `config.json`
as the `seed` value:

```sh
npm run gen-seed
# 1f3c…(64 hex chars)…b7
```

Equivalent to:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Treat the seed like a secret — anyone holding it can impersonate the
bridge on the DHT.

On startup the bridge prints the DHT public key it is listening on, e.g.:

```
github-asana-bridge listening on DHT key <base32-key> path=/webhook
```

Hand that key to your `http-dht-proxy` deployment and point the GitHub
organization webhook at the proxy's public URL.

Run the tests with:

```sh
npm test
```

---

## Configuration

Configuration lives in a JSON file. By default the bridge looks for
`./config.json`; override that with the `CONFIG_PATH` environment variable:

```sh
CONFIG_PATH=/etc/github-asana-bridge/config.json npm start
```

A template is provided in [`config.example.json`](./config.example.json):

```json
{
  "path": "/webhook",
  "seed": "",
  "acceptUnknownEvents": true,
  "github": {
    "webhookSecret": "replace-with-the-secret-you-set-on-the-github-org-webhook"
  },
  "asana": {
    "token": "replace-with-your-asana-personal-access-token",
    "apiBase": "https://app.asana.com/api/1.0",
    "prUrlFieldGid": "1207193124323392",
    "prUrlFieldName": "GH PR",
    "prMergedFieldGid": "1211319677640481",
    "prMergedFieldName": "merged",
    "prMergedEnumValue": "Yes"
  }
}
```

### Top-level

| Key                   | Type    | Required | Description                                                                                                                                                                                                                                          |
| --------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`                | string  | no       | URL path the bridge accepts POSTs on. Defaults to `/webhook`. Must match the path configured on the GitHub webhook (and on `http-dht-proxy`).                                                                                                        |
| `seed`                | string  | no       | 64-character hex string (32 bytes) used to derive a stable DHT key pair. Leave empty to generate an ephemeral key on each start. Generate one with `npm run gen-seed` (see [Generating a stable seed](#generating-a-stable-seed)). |
| `acceptUnknownEvents` | boolean | no       | When `true` (the default), events that have no registered handler — e.g. `star`, `watch`, `fork` from an org-wide "Send me everything" webhook — are answered with `200 ok` so GitHub doesn't mark the delivery as failed. Set to `false` to return `404 no handler for event` instead, which surfaces unhandled events as red entries in the GitHub webhook UI. Registered handlers always take precedence regardless of this setting. |

### `github`

| Key             | Type   | Required | Description                                                                                                                                          |
| --------------- | ------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webhookSecret` | string | yes      | The secret you set when creating the GitHub webhook. Each request is verified with HMAC-SHA256 against the `X-Hub-Signature-256` header. Required. |

### `asana`

| Key                  | Type   | Required | Description                                                                                                                                                                                              |
| -------------------- | ------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`              | string | no       | Asana Personal Access Token. If absent or left as the placeholder, the bridge runs in "dry-run" mode: it logs what it would do but does not call Asana.                                                  |
| `apiBase`            | string | no       | Asana API base URL. Defaults to `https://app.asana.com/api/1.0`.                                                                                                                                         |
| `prUrlFieldGid`      | string | no       | Gid of the Asana custom field that should hold the PR URL. Preferred — gids are stable across renames.                                                                                                   |
| `prUrlFieldName`     | string | no       | Fallback name lookup for the PR URL field if `prUrlFieldGid` isn't set or doesn't match. Defaults to `GH PR`.                                                                                            |
| `prMergedFieldGid`   | string | no       | Gid of the Asana enum custom field that tracks "merged" state.                                                                                                                                           |
| `prMergedFieldName`  | string | no       | Fallback name lookup for the merged field. Defaults to `merged`.                                                                                                                                         |
| `prMergedEnumValue`  | string | no       | The name of the enum option to set when a PR is merged. Defaults to `Yes`.                                                                                                                               |

`config.json` is gitignored — only `config.example.json` is committed.

---

## Current handlers

Handlers live in [`handlers/`](./handlers) and are dispatched by the value of
the `X-GitHub-Event` header. When a handler is registered the dispatcher
responds `202 Accepted` immediately and runs the handler in the background.
Events with no registered handler default to `200 ok` (logged and ignored)
so GitHub doesn't flag deliveries from "Send me everything" webhooks as
failed; flip [`acceptUnknownEvents`](#top-level) to `false` if you'd rather
see them as 404s.

### `ping` — [`handlers/ping.js`](./handlers/ping.js)

Fired by GitHub when a webhook is created or you click "Redeliver". Logs the
zen message, hook id, and originating organization. No Asana side effects.

### `pull_request` — [`handlers/pull_request.js`](./handlers/pull_request.js)

Reacts to all `pull_request` event actions (opened, edited, closed, etc.).

1. Logs a one-line summary of the PR (`repo`, `action`, `#number`, `status`,
   `url`, extracted task list).
2. Scans the PR body for Asana task links. Both URL shapes are recognized:
   - New: `https://app.asana.com/1/<workspace>/project/<project>/task/<task>`
   - Old: `https://app.asana.com/0/<project>/<task>`
3. For each referenced task, calls `syncPrToTask` (see
   [`lib/asana.js`](./lib/asana.js)) which:
   - **PR URL field** (text): if empty, set it to the PR URL. If already set
     to anything (the same PR or a different value), leave it alone.
   - **PR Merged field** (enum): only touched when the PR's status is
     `merged`. If not already set to `prMergedEnumValue`, flip it. Never
     cleared on close-without-merge.

If `asana.token` is unset the handler logs what it *would* sync and returns
without calling the API.

---

## Adding a new handler

The handler contract is intentionally tiny:

```js
// handlers/<event>.js
'use strict';

module.exports = async function handle<Event>(payload, context) {
  // payload  – parsed JSON body from GitHub
  // context  – { config, asanaClient, log }
  //   config       – the parsed config object
  //   asanaClient  – Asana REST client (or null in dry-run mode)
  //   log          – currently `console`
};
```

Steps:

1. **Pick the event name.** Use the value GitHub sends in the
   `X-GitHub-Event` header (e.g. `issues`, `push`, `issue_comment`). See
   [GitHub's webhook events docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads).

2. **Create the handler file.** Add `handlers/<event>.js` exporting an async
   function with the signature above. Keep side effects inside the handler;
   don't reach back into `index.js`.

3. **Register it.** Add one line to [`handlers/index.js`](./handlers/index.js):

   ```js
   module.exports = {
     ping: require('./ping'),
     pull_request: require('./pull_request'),
     issues: require('./issues') // <-- new
   };
   ```

4. **(Optional) Use the Asana client.** If you need to read or update Asana,
   pull `asanaClient` out of `context`. It exposes:
   - `getTask(taskId)` — `GET /tasks/{gid}` with the custom-field opt-fields
     the bridge needs.
   - `updateTaskCustomFields(taskId, fields)` — `PUT /tasks/{gid}` with a
     `{ data: { custom_fields } }` body.

   Always guard against `asanaClient` being `null` (dry-run mode) and log
   what you would have done instead.

5. **Subscribe on the GitHub side.** In the org/repo webhook settings, tick
   the event you just added. Until you do, GitHub never sends it.

6. **Test it.** Add a file under `test/` (Brittle is the runner). The
   existing [`test/pull_request.js`](./test/pull_request.js) is a good
   template — it builds a fake `asanaClient` and asserts on the resulting
   sync actions without hitting the network.

### Handler conventions

- **Async, fire-and-forget.** The HTTP layer responds `202` before your
  handler finishes. Any error you throw (sync or async) is caught and logged
  by the dispatcher; the process keeps running.
- **Log with a `[event]` prefix.** Makes it easy to grep through logs from
  multiple event types interleaved.
- **Never read config from disk or hit the network outside what `context`
  gives you.** That keeps handlers unit-testable with plain object fakes.

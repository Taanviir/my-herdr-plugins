"use strict";

// Shows markdown in the viewer pane beside a pane: the one already open in
// that tab if there is one, or a new split. A running viewer takes requests
// through a file named after its pane, since a pane's environment is fixed
// once it starts.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { run } = require("./shared/herdr");

const PLUGIN_ID = "taanviir.render-md";
const TITLE = "Render MD";
const REQUESTS = path.join(os.tmpdir(), `herdr-render-md-${process.getuid?.() ?? "user"}`);
const POLL_MS = 250;

const requestFile = (pane) => path.join(REQUESTS, `${pane.replace(/[^\w-]/g, "_")}.json`);

// The viewer in the same tab as `pane`, which may be `pane` itself.
function viewerFor(pane) {
  const res = run(["pane", "list"], { check: false });
  if (!res.ok) return null;
  const panes = res.result.panes ?? [];
  const tab = panes.find((candidate) => candidate.pane_id === pane)?.tab_id;
  return panes.find((candidate) => candidate.tab_id === tab && candidate.label === TITLE)?.pane_id ?? null;
}

function openPane({ pane, ...request }) {
  const args = ["plugin", "pane", "open", "--plugin", PLUGIN_ID, "--entrypoint", "view", "--placement", "split", "--direction", "right", "--focus"];
  if (pane) args.push("--target-pane", pane);
  const env = { RENDER_MD_CWD: request.cwd, RENDER_MD_FILE: request.file, RENDER_MD_LATEST: request.latest ? "1" : "" };
  for (const [key, value] of Object.entries(env)) if (value) args.push("--env", `${key}=${value}`);
  return run(args, { check: false });
}

// `request` is { cwd?, file?, latest? }: a file, the newest file in cwd, or the list.
function show({ pane, ...request }) {
  const viewer = pane && viewerFor(pane);
  if (!viewer) return openPane({ pane, ...request });
  fs.mkdirSync(REQUESTS, { recursive: true });
  fs.writeFileSync(requestFile(viewer), JSON.stringify(viewer === pane ? { ...request, cwd: undefined } : request));
  return run(["plugin", "pane", "focus", viewer], { check: false });
}

function onRequest(pane, handle) {
  const file = requestFile(pane);
  fs.rmSync(file, { force: true });
  fs.watchFile(file, { interval: POLL_MS }, (now) => {
    if (!now.mtimeMs) return;
    let request;
    try {
      request = JSON.parse(fs.readFileSync(file, "utf8"));
      fs.rmSync(file, { force: true });
    } catch {
      return;
    }
    handle(request);
  });
}

module.exports = { PLUGIN_ID, show, onRequest };

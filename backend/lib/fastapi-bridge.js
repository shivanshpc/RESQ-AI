const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const FASTAPI_SCRIPT = process.env.FASTAPI_SCRIPT_PATH || path.join(REPO_ROOT, 'fastapi_server.py');
const DEFAULT_PORTS = (process.env.FASTAPI_PORTS || '8001,8000')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

const HEALTH_PATH = '/health';
const STARTUP_TIMEOUT_MS = Number(process.env.FASTAPI_STARTUP_TIMEOUT_MS || 30000);
const REQUEST_TIMEOUT_MS = Number(process.env.FASTAPI_REQUEST_TIMEOUT_MS || 15000);
const MIN_RESTART_GAP_MS = Number(process.env.FASTAPI_MIN_RESTART_GAP_MS || 5000);

let bridgeProcess = null;
let bridgeStartingPromise = null;
let lastStartAttemptAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toUrl(port, routePath = '') {
  return `http://127.0.0.1:${port}${routePath}`;
}

function getBridgeUrls(routePath = '') {
  return DEFAULT_PORTS.map((port) => toUrl(port, routePath));
}

async function getFetch() {
  return (await import('node-fetch')).default;
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function isBridgeReachable() {
  const fetchImpl = await getFetch();
  const healthUrls = getBridgeUrls(HEALTH_PATH);

  for (const url of healthUrls) {
    try {
      const res = await fetchWithTimeout(fetchImpl, url, { method: 'GET' }, 3000);
      if (res.ok) {
        return true;
      }
    } catch {
      // Try next health endpoint.
    }
  }

  return false;
}

function getPythonCandidates() {
  if (process.env.FASTAPI_START_CMD) {
    return [{
      command: process.env.FASTAPI_START_CMD,
      args: [],
      shell: true,
      label: 'FASTAPI_START_CMD'
    }];
  }

  const candidates = [];
  const isWindows = process.platform === 'win32';
  const venvPython = isWindows
    ? path.join(REPO_ROOT, '.venv', 'Scripts', 'python.exe')
    : path.join(REPO_ROOT, '.venv', 'bin', 'python');

  if (fs.existsSync(venvPython)) {
    candidates.push({ command: venvPython, args: [FASTAPI_SCRIPT], shell: false, label: '.venv python' });
  }

  candidates.push({ command: 'python', args: [FASTAPI_SCRIPT], shell: false, label: 'python' });

  if (isWindows) {
    candidates.push({ command: 'py', args: ['-3', FASTAPI_SCRIPT], shell: false, label: 'py -3' });
  }

  return candidates;
}

function attachProcessLogging(proc, label) {
  proc.stdout.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) console.log(`[FastAPI:${label}] ${text}`);
  });

  proc.stderr.on('data', (chunk) => {
    const text = String(chunk).trim();
    if (text) console.error(`[FastAPI:${label}] ${text}`);
  });
}

function resetBridgeProcessOnExit(proc, label) {
  proc.on('exit', (code, signal) => {
    console.warn(`[FastAPI:${label}] exited (code=${code}, signal=${signal})`);
    if (bridgeProcess === proc) {
      bridgeProcess = null;
    }
  });
}

async function waitForBridgeReady(timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isBridgeReachable()) {
      return true;
    }
    await sleep(700);
  }

  return false;
}

async function spawnBridge() {
  if (!fs.existsSync(FASTAPI_SCRIPT)) {
    console.error(`FastAPI script not found: ${FASTAPI_SCRIPT}`);
    return false;
  }

  const candidates = getPythonCandidates();
  for (const candidate of candidates) {
    try {
      const child = spawn(candidate.command, candidate.args, {
        cwd: REPO_ROOT,
        shell: candidate.shell,
        windowsHide: true,
        env: { ...process.env }
      });

      attachProcessLogging(child, candidate.label);
      resetBridgeProcessOnExit(child, candidate.label);

      const ready = await waitForBridgeReady(STARTUP_TIMEOUT_MS);
      if (ready) {
        bridgeProcess = child;
        return true;
      }

      child.kill();
    } catch (err) {
      console.warn(`Failed to spawn FastAPI with ${candidate.label}: ${err.message}`);
    }
  }

  return false;
}

async function ensureBridgeRunning() {
  if (await isBridgeReachable()) {
    return true;
  }

  const now = Date.now();
  if (now - lastStartAttemptAt < MIN_RESTART_GAP_MS) {
    return false;
  }

  lastStartAttemptAt = now;

  if (!bridgeStartingPromise) {
    bridgeStartingPromise = spawnBridge().finally(() => {
      bridgeStartingPromise = null;
    });
  }

  return bridgeStartingPromise;
}

async function requestBridge(routePath, requestFactory, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 2));
  const requestTimeout = Number(options.timeoutMs || REQUEST_TIMEOUT_MS);
  const fetchImpl = await getFetch();

  let lastError = 'No bridge response';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await ensureBridgeRunning();

    for (const url of getBridgeUrls(routePath)) {
      try {
        const req = requestFactory();
        const res = await fetchWithTimeout(fetchImpl, url, req, requestTimeout);

        if (res.ok) {
          return { ok: true, response: res, triedUrl: url };
        }

        lastError = await res.text();
      } catch (err) {
        lastError = String(err && err.message ? err.message : err);
      }
    }
  }

  return { ok: false, error: lastError };
}

module.exports = {
  requestBridge,
  ensureBridgeRunning,
  isBridgeReachable,
  getBridgeUrls,
};

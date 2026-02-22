import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_PORT = 5099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "../..");

let serverProcess;
let dataDir;
let adminToken;
let serverLogs = "";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/api/auth/config`);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Keep retrying while the process boots.
    }

    await delay(500);
  }

  throw new Error(`Server did not start in time. Logs:\n${serverLogs}`);
}

async function request(method, endpoint, { token, body } = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.bytestashauth = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await response.json();
  } catch (_error) {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    data: json,
  };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bytestash-int-"));

  serverProcess = spawn(process.execPath, ["src/app.js"], {
    cwd: SERVER_ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      BYTESTASH_DATA_PATH: dataDir,
      JWT_SECRET: "integration-secret",
      DEBUG: "false",
      OIDC_ENABLED: "false",
      DISABLE_ACCOUNTS: "false",
      DISABLE_INTERNAL_ACCOUNTS: "false",
      ALLOW_PASSWORD_CHANGES: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (serverProcess.stdout) {
    serverProcess.stdout.on("data", (chunk) => {
      serverLogs += chunk.toString();
    });
  }

  if (serverProcess.stderr) {
    serverProcess.stderr.on("data", (chunk) => {
      serverLogs += chunk.toString();
    });
  }

  await waitForServer();
});

after(async () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
  }
  if (dataDir && fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("bootstraps first user as SUPER_ADMIN", async () => {
  const registerResponse = await request("POST", "/api/auth/register", {
    body: {
      username: "rootadmin",
      password: "supersecurepassword",
    },
  });

  assert.equal(registerResponse.status, 200);
  assert.ok(registerResponse.data?.token);
  assert.equal(registerResponse.data?.user?.role, "SUPER_ADMIN");
  assert.equal(registerResponse.data?.user?.status, "ACTIVE");
  adminToken = registerResponse.data.token;
});

test("honors APPROVAL registration mode with pending account status", async () => {
  const settingsResponse = await request("PATCH", "/api/admin/settings", {
    token: adminToken,
    body: {
      registrationMode: "APPROVAL",
    },
  });

  assert.equal(settingsResponse.status, 200);

  const registerResponse = await request("POST", "/api/auth/register", {
    body: {
      username: "pendinguser",
      password: "supersecurepassword",
    },
  });

  assert.equal(registerResponse.status, 202);
  assert.equal(registerResponse.data?.pendingApproval, true);
  assert.equal(registerResponse.data?.user?.status, "PENDING");

  const loginResponse = await request("POST", "/api/auth/login", {
    body: {
      username: "pendinguser",
      password: "supersecurepassword",
    },
  });

  assert.equal(loginResponse.status, 403);
});

test("applies lockout after failed logins and supports admin unlock", async () => {
  await request("PATCH", "/api/admin/settings", {
    token: adminToken,
    body: {
      registrationMode: "OPEN",
      lockoutMaxAttempts: 2,
      lockoutDurationMinutes: 5,
    },
  });

  const registerResponse = await request("POST", "/api/auth/register", {
    body: {
      username: "lockoutuser",
      password: "validpassword123",
    },
  });
  assert.equal(registerResponse.status, 200);
  const lockedUserId = registerResponse.data?.user?.id;

  const firstFailed = await request("POST", "/api/auth/login", {
    body: {
      username: "lockoutuser",
      password: "wrongpassword",
    },
  });
  assert.equal(firstFailed.status, 401);

  const secondFailed = await request("POST", "/api/auth/login", {
    body: {
      username: "lockoutuser",
      password: "wrongpassword",
    },
  });
  assert.equal(secondFailed.status, 401);

  const lockedAttempt = await request("POST", "/api/auth/login", {
    body: {
      username: "lockoutuser",
      password: "validpassword123",
    },
  });
  assert.equal(lockedAttempt.status, 423);

  const unlockResponse = await request("PATCH", `/api/admin/users/${lockedUserId}/unlock`, {
    token: adminToken,
  });
  assert.equal(unlockResponse.status, 200);

  const postUnlockLogin = await request("POST", "/api/auth/login", {
    body: {
      username: "lockoutuser",
      password: "validpassword123",
    },
  });
  assert.equal(postUnlockLogin.status, 200);
});

test("gates public library by community mode toggle", async () => {
  const publicBefore = await request("GET", "/api/public/snippets");
  assert.equal(publicBefore.status, 404);

  await request("PATCH", "/api/admin/settings", {
    token: adminToken,
    body: {
      communityMode: "ON",
    },
  });

  const publicAfter = await request("GET", "/api/public/snippets");
  assert.equal(publicAfter.status, 200);
});

test("records audit logs for security-sensitive actions", async () => {
  const auditResponse = await request("GET", "/api/admin/audit?limit=20&offset=0", {
    token: adminToken,
  });

  assert.equal(auditResponse.status, 200);
  assert.ok(Array.isArray(auditResponse.data?.logs));
  assert.ok(auditResponse.data.logs.length > 0);

  const actions = auditResponse.data.logs.map((entry) => entry.action);
  assert.ok(actions.includes("auth.login.failed"));
  assert.ok(actions.includes("admin.settings.update"));
});

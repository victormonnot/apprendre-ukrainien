import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium, devices, expect, request } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = `ukrainien-test-${process.pid}-${randomBytes(4).toString("hex")}`;
const origin = "https://localhost:3143";
const host = "localhost:3143";
const login = "hosting-test";
const password = randomBytes(24).toString("base64url");
const proxySecret = randomBytes(32).toString("hex");
const predefinedImage = process.env.HOSTING_TEST_IMAGE?.trim() || null;
const privateValues = [
  password,
  proxySecret,
  Buffer.from(`${login}:${password}`).toString("base64"),
];
const directory = await mkdtemp(join(tmpdir(), `${project}-`));
const envFile = join(directory, "qa.env");
const overrideFile = join(directory, "compose.qa.yaml");
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (/^(APP_|OPENAI_|COMPOSE_)/u.test(key)) delete environment[key];
}
// Preserve DOCKER_CONTEXT (and Docker's own connection settings) from the caller.
environment.COMPOSE_ANSI = "never";
const composeArgs = [
  "compose",
  "--project-directory",
  root,
  "-p",
  project,
  "--env-file",
  envFile,
  "-f",
  join(root, "compose.yaml"),
  "-f",
  overrideFile,
];
const processes = new Set();
const clients = new Set();
let browser;
let started = false;
let interrupted = false;
let cleanupPromise;
let passed = 0;

function redact(value) {
  let text = String(value);
  for (const secret of privateValues)
    if (secret) text = text.replaceAll(secret, "[test credential]");
  return text;
}

function command(args, { input, timeout = 120_000, cleaning = false } = {}) {
  if (interrupted && !cleaning)
    return Promise.reject(new Error("Integration test interrupted."));
  return new Promise((accept, reject) => {
    const child = spawn("docker", args, {
      cwd: root,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    processes.add(child);
    let output = "";
    let errors = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeout);
    child.stdout.on("data", (chunk) => {
      output = (output + chunk).slice(-2_000_000);
    });
    child.stderr.on("data", (chunk) => {
      errors = (errors + chunk).slice(-2_000_000);
    });
    child.stdin.on("error", () => {
      /* Exiting commands can close stdin early. */
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      processes.delete(child);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      processes.delete(child);
      if (code === 0 && !timedOut) accept(output.trim());
      else
        reject(
          new Error(
            `${timedOut ? "Docker command timed out" : `Docker command failed (${code})`}: ${redact((errors + "\n" + output).slice(-12_000))}`,
          ),
        );
    });
    child.stdin.end(input);
  });
}

function compose(args, options) {
  return command([...composeArgs, ...args], options);
}

async function client(credentials) {
  const value = await request.newContext({
    baseURL: origin,
    // Caddy's private CA is confined to this disposable localhost test.
    ignoreHTTPSErrors: true,
    timeout: 15_000,
    ...(credentials
      ? { httpCredentials: { ...credentials, origin, send: "always" } }
      : {}),
  });
  clients.add(value);
  return value;
}

async function verify(name, run) {
  await run();
  passed++;
  console.log(`✓ ${name}`);
}

async function waitReady(authenticated) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error("Integration test interrupted.");
    try {
      const response = await authenticated.get("/api/workspace", {
        timeout: 3_000,
      });
      if (
        response.status() === 200 &&
        /^[0-9a-f]{32}$/u.test((await response.json()).generation)
      )
        return;
    } catch {
      /* The proxy and application can start at different speeds. */
    }
    await delay(500);
  }
  throw new Error(
    "The authenticated HTTPS application did not become ready within 90 seconds.",
  );
}

async function json(response, expected = 200) {
  assert.equal(
    response.status(),
    expected,
    `Unexpected HTTP status for ${new URL(response.url()).pathname}`,
  );
  return response.json();
}

async function currentGeneration(authenticated) {
  return (await json(await authenticated.get("/api/workspace"))).generation;
}

async function mutate(authenticated, path, data) {
  return authenticated.post(path, {
    headers: {
      Origin: origin,
      "X-Workspace-Generation": await currentGeneration(authenticated),
    },
    data,
  });
}

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const failures = [];
    try {
      await browser?.close();
    } catch {
      /* A terminated browser needs no further cleanup. */
    }
    await Promise.allSettled([...clients].map((value) => value.dispose()));
    if (started) {
      try {
        assert.match(project, /^ukrainien-test-\d+-[a-f0-9]{8}$/u);
        await compose(
          [
            "down",
            "--volumes",
            "--remove-orphans",
            "--rmi",
            "local",
            "--timeout",
            "20",
          ],
          { cleaning: true },
        );
        const containers = await command(
          [
            "ps",
            "-aq",
            "--filter",
            `label=com.docker.compose.project=${project}`,
          ],
          { cleaning: true },
        );
        const volumes = await command(
          [
            "volume",
            "ls",
            "-q",
            "--filter",
            `label=com.docker.compose.project=${project}`,
          ],
          { cleaning: true },
        );
        assert.equal(containers, "", "The test containers were not removed.");
        assert.equal(volumes, "", "The test volumes were not removed.");
      } catch (error) {
        failures.push(error);
      }
    }
    // The password hasher is also uniquely named; never target unrelated containers.
    await command(["rm", "-f", `${project}-hash`], { cleaning: true }).catch(
      () => {},
    );
    await rm(directory, { recursive: true, force: true });
    if (failures.length)
      throw new AggregateError(
        failures,
        "The disposable Docker project could not be fully removed.",
      );
  })();
  return cleanupPromise;
}

function interrupt() {
  if (interrupted) return;
  interrupted = true;
  process.exitCode = 130;
  for (const child of processes) child.kill("SIGTERM");
  void cleanup().catch((error) => console.error(redact(error)));
}
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

try {
  await access(join(root, "compose.yaml"));
  await access(join(root, "deploy", "Caddyfile"));
  console.log(`Preparing disposable HTTPS integration project ${project}…`);
  const passwordHash = await command(
    [
      "run",
      "--rm",
      "--name",
      `${project}-hash`,
      "-i",
      "caddy:2.11.4-alpine",
      "caddy",
      "hash-password",
      "--algorithm",
      "bcrypt",
    ],
    { input: `${password}\n` },
  );
  assert.match(
    passwordHash,
    /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/u,
    "Caddy did not return a bcrypt hash.",
  );
  privateValues.push(passwordHash);
  privateValues.push(passwordHash.replaceAll("$", "$$"));
  Object.assign(environment, {
    APP_HOST: host,
    APP_LOGIN: login,
    APP_PASSWORD_HASH: passwordHash,
    APP_PROXY_SECRET: proxySecret,
    OPENAI_API_KEY: "",
    OPENAI_MODEL: "gpt-5.4-mini",
  });
  await writeFile(
    envFile,
    `APP_HOST=${host}\nAPP_LOGIN=${login}\nAPP_PASSWORD_HASH='${passwordHash}'\nAPP_PROXY_SECRET=${proxySecret}\nOPENAI_API_KEY=\n`,
    { mode: 0o600 },
  );
  if (predefinedImage)
    assert.match(
      predefinedImage,
      /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,240}$/u,
      "HOSTING_TEST_IMAGE must be a Docker image reference.",
    );
  await writeFile(
    overrideFile,
    `services:\n${predefinedImage ? `  app:\n    image: ${JSON.stringify(predefinedImage)}\n` : ""}  caddy:\n    ports: !override\n      - "127.0.0.1:3143:3143"\n`,
    { mode: 0o600 },
  );
  const configuration = JSON.parse(
    await compose(["config", "--format", "json"]),
  );
  assert.equal(configuration.name, project);
  assert.equal(
    configuration.services.app.ports?.length ?? 0,
    0,
    "The application must not publish a direct port.",
  );
  assert.equal(
    configuration.services.caddy.ports.length,
    1,
    "Only the disposable TLS port may be published.",
  );
  const port = configuration.services.caddy.ports[0];
  assert.equal(port.host_ip, "127.0.0.1");
  assert.equal(Number(port.published), 3143);
  assert.equal(Number(port.target), 3143);
  for (const volume of Object.values(configuration.volumes ?? {})) {
    assert.notEqual(
      volume.external,
      true,
      "The test must not attach an external volume.",
    );
    assert.ok(
      volume.name.startsWith(`${project}_`),
      "All volumes must belong to the disposable test project.",
    );
  }
  for (const service of Object.values(configuration.services)) {
    for (const mount of service.volumes ?? []) {
      if (mount.type === "bind") {
        assert.equal(
          resolve(mount.source),
          join(root, "deploy", "Caddyfile"),
          "Only the public Caddy configuration may be bind-mounted.",
        );
        assert.equal(mount.read_only, true);
      }
    }
  }
  started = true;
  console.log(
    predefinedImage
      ? "Starting the isolated application from the supplied image and Caddy…"
      : "Building and starting the isolated application and Caddy…",
  );
  await compose(["up", "-d", predefinedImage ? "--no-build" : "--build"], {
    timeout: 20 * 60_000,
  });
  const authenticated = await client({ username: login, password });
  const anonymous = await client();
  await waitReady(authenticated);

  await verify(
    "authentication protects pages, API mutations, backups and media (GET/HEAD)",
    async () => {
      const missingId = "00000000-0000-4000-8000-000000000000";
      for (const path of [
        "/",
        "/parcours",
        "/parcours/01/cours",
        "/ressources",
        "/donnees",
        "/api/workspace",
        "/api/backups",
        `/api/backups/download?id=${missingId}`,
        `/api/audio/${missingId}`,
      ]) {
        for (const method of ["GET", "HEAD"]) {
          const response = await anonymous.fetch(path, { method });
          assert.equal(
            response.status(),
            401,
            `${method} ${path} must require authentication.`,
          );
          assert.match(response.headers()["www-authenticate"] ?? "", /Basic/iu);
        }
      }
      for (const path of [
        "/api/backups",
        "/api/backups/inspect",
        "/api/backups/restore",
        "/api/learning",
        "/api/audio",
      ]) {
        const response = await anonymous.post(path, {
          headers: { Origin: origin, "X-App-Proxy-Secret": proxySecret },
          data: { type: "create" },
        });
        assert.equal(
          response.status(),
          401,
          `POST ${path} must require authentication even with a forged proxy header.`,
        );
      }
      const wrongPassword = await client({
        username: login,
        password: `${password}-incorrect`,
      });
      assert.equal((await wrongPassword.get("/api/workspace")).status(), 401);
      assert.equal(
        (await wrongPassword.get("/parcours/01/cours")).status(),
        401,
      );
    },
  );

  await verify(
    "authenticated HTTPS serves the course and the shared workspace API",
    async () => {
      const response = await authenticated.get("/parcours/01/cours");
      assert.equal(response.status(), 200);
      assert.match(response.headers()["content-type"] ?? "", /text\/html/u);
      assert.match(
        response.headers()["cache-control"] ?? "",
        /private.*no-store/u,
      );
      assert.equal(response.headers()["x-frame-options"], "DENY");
      assert.match(await response.text(), /ukrainien/iu);
      assert.match(await currentGeneration(authenticated), /^[0-9a-f]{32}$/u);
      assert.equal(
        (await json(await authenticated.get("/api/resources?id=ulp-001")))
          .resource.id,
        "ulp-001",
      );
    },
  );

  await verify(
    "the proxy replaces client forwarding headers and rejects foreign origins",
    async () => {
      const response = await authenticated.get("/api/workspace", {
        headers: {
          "X-Forwarded-Host": "foreign.invalid",
          "X-Forwarded-Proto": "http",
          "X-App-Proxy-Secret": "forged",
        },
      });
      assert.equal(
        response.status(),
        200,
        "Client forwarding headers must not override the configured proxy identity.",
      );
      const wrongOrigin = await authenticated.post("/api/backups", {
        headers: {
          Origin: "https://foreign.invalid",
          "X-Workspace-Generation": await currentGeneration(authenticated),
        },
        data: { type: "create" },
      });
      assert.equal(wrongOrigin.status(), 403);
      const missingOrigin = await authenticated.post("/api/backups", {
        headers: {
          "X-Workspace-Generation": await currentGeneration(authenticated),
        },
        data: { type: "create" },
      });
      assert.equal(missingOrigin.status(), 403);
    },
  );

  await verify(
    "direct application requests cannot bypass the proxy using Host or forwarded headers",
    async () => {
      const output = await compose([
        "exec",
        "-T",
        "app",
        "node",
        "--input-type=module",
        "-e",
        `
      import assert from "node:assert/strict";
      const publicOrigin = new URL(process.env.APP_ORIGIN);
      const tests = [
        {path:"/parcours/01/cours", headers:{Host:publicOrigin.host}},
        {path:"/api/workspace", headers:{Host:publicOrigin.host}},
        {path:"/api/backups", headers:{Host:publicOrigin.host}},
        {path:"/api/audio/00000000-0000-4000-8000-000000000000", headers:{Host:publicOrigin.host}},
        {path:"/api/workspace", headers:{Host:publicOrigin.host,"X-Forwarded-Host":publicOrigin.host,"X-Forwarded-Proto":"https"}},
        {path:"/api/workspace", headers:{Host:"foreign.invalid","X-Forwarded-Host":publicOrigin.host,"X-Forwarded-Proto":"https","X-App-Proxy-Secret":process.env.APP_PROXY_SECRET}},
        {path:"/parcours/01/cours", headers:{Host:"localhost:3000","X-App-Proxy-Secret":process.env.APP_PROXY_SECRET}}
      ];
      for (const entry of tests) {
        const response = await fetch("http://127.0.0.1:3000" + entry.path, {headers:entry.headers,redirect:"manual"});
        assert.equal(response.status,403,entry.path);
      }
      console.log("direct-access-checks-passed");
    `,
      ]);
      assert.equal(output, "direct-access-checks-passed");
    },
  );

  const courseNote = `Hosted desktop note ${randomUUID()} · Дякую.`;
  const resourceNote = `Hosted shared resource note ${randomUUID()} · Привіт.`;
  browser = await chromium.launch();
  const desktop = await browser.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    httpCredentials: { username: login, password, origin },
    viewport: { width: 1280, height: 900 },
  });
  const mobile = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: origin,
    ignoreHTTPSErrors: true,
    httpCredentials: { username: login, password, origin },
  });
  const browserErrors = [];
  for (const context of [desktop, mobile])
    context.on("page", (page) =>
      page.on("pageerror", (error) => browserErrors.push(error.message)),
    );

  await verify(
    "desktop writes a course note and same-origin API writes a resource note",
    async () => {
      const page = await desktop.newPage();
      await page.goto("/parcours/01/cours");
      await expect(page.locator("article.prose")).toBeVisible();
      const details = page.locator("details").filter({
        has: page
          .locator("summary")
          .filter({ hasText: "Mon suivi et mes notes" }),
      });
      if ((await details.getAttribute("open")) === null)
        await details.locator("summary").click();
      const note = page.getByRole("textbox", {
        name: "Ma note personnelle",
        exact: true,
      });
      await expect(note).toBeEnabled();
      await note.fill(courseNote);
      const saved = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/learning" &&
          response.request().method() === "POST" &&
          response.request().postDataJSON()?.type === "note",
      );
      await page
        .getByRole("button", { name: "Enregistrer ma note", exact: true })
        .click();
      assert.equal((await saved).status(), 200);
      const state = await json(
        await authenticated.get("/api/resources?id=ulp-001"),
      );
      const changed = await json(
        await mutate(authenticated, "/api/resources", {
          type: "save-notes",
          requestId: randomUUID(),
          resourceId: "ulp-001",
          expectedRevision: state.state.notesRevision,
          notes: resourceNote,
        }),
      );
      assert.equal(changed.state.notes, resourceNote);
    },
  );

  await verify(
    "a separate mobile browser sees both persisted notes",
    async () => {
      const page = await mobile.newPage();
      await page.goto("/parcours/01/cours");
      const details = page.locator("details").filter({
        has: page
          .locator("summary")
          .filter({ hasText: "Mon suivi et mes notes" }),
      });
      await expect(details).toBeVisible();
      if ((await details.getAttribute("open")) === null)
        await details.locator("summary").click();
      await expect(
        page.getByRole("textbox", { name: "Ma note personnelle", exact: true }),
      ).toHaveValue(courseNote);
      await page.goto("/ressources/ulp-001");
      await expect(
        page.getByRole("textbox", {
          name: "Ce que je veux retenir",
          exact: true,
        }),
      ).toHaveValue(resourceNote);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.deepEqual(browserErrors, []);
    },
  );

  let audioFixture;
  await verify(
    "authenticated audio GET, HEAD and ranges serve explicit test fixtures while anonymous requests stay blocked",
    async () => {
      // These silent PCM files exercise storage/transport only, never a speech provider.
      audioFixture = JSON.parse(
        await compose([
          "exec",
          "-T",
          "app",
          "node",
          "--input-type=module",
          "-e",
          `
      import assert from "node:assert/strict";
      import {createHash,randomUUID} from "node:crypto";
      import {join} from "node:path";
      import {DatabaseSync} from "node:sqlite";
      const bytes=Buffer.alloc(6*1024*1024);
      bytes.write("RIFF");bytes.writeUInt32LE(bytes.length-8,4);bytes.write("WAVE",8);
      bytes.write("fmt ",12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
      bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
      bytes.write("data",36);bytes.writeUInt32LE(bytes.length-44,40);
      const database=new DatabaseSync(join(process.env.APP_DATA_DIR,"learning.sqlite3"));
      try {
        database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE;");
        const user=database.prepare("SELECT id FROM profiles WHERE is_local=1").get();
        assert.ok(user);
        const insert=database.prepare("INSERT INTO audio_clips(id,user_id,cache_key,text,voice_id,voice_label,provider,model,instructions_version,mime_type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
        const ids=[];
        for(const text of ["Тест один","Тест два"]) {
          const descriptor={text,voiceId:"macos-lesya",provider:"macos",model:"hosting-fixture-v1",instructionsVersion:1};
          const key=createHash("sha256").update(JSON.stringify(descriptor)).digest("hex");
          const id=randomUUID();ids.push(id);
          insert.run(id,user.id,key,text,descriptor.voiceId,"Fixture de test : PCM silencieux",descriptor.provider,descriptor.model,1,"audio/wav",bytes,new Date().toISOString());
        }
        database.exec("COMMIT;");
        console.log(JSON.stringify({ids,size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")}));
      } finally { database.close(); }
    `,
        ]),
      );
      assert.equal(audioFixture.ids.length, 2);
      for (const id of audioFixture.ids) {
        const path = `/api/audio/${id}`;
        for (const method of ["GET", "HEAD"])
          assert.equal((await anonymous.fetch(path, { method })).status(), 401);
        const head = await authenticated.head(path);
        assert.equal(head.status(), 200);
        assert.equal(
          Number(head.headers()["content-length"]),
          audioFixture.size,
        );
        assert.equal(head.headers()["content-type"], "audio/wav");
        const bytes = await authenticated.get(path);
        assert.equal(bytes.status(), 200);
        assert.equal(
          createHash("sha256")
            .update(await bytes.body())
            .digest("hex"),
          audioFixture.sha256,
        );
        const range = await authenticated.get(path, {
          headers: { Range: "bytes=0-3" },
        });
        assert.equal(range.status(), 206);
        assert.equal(
          range.headers()["content-range"],
          `bytes 0-3/${audioFixture.size}`,
        );
        assert.equal((await range.body()).toString("ascii"), "RIFF");
      }
    },
  );

  let backup;
  let backupHash;
  await verify(
    "backup download and upload above 10 MiB preserve notes and cached fixture audio",
    async () => {
      backup = await json(
        await mutate(authenticated, "/api/backups", { type: "create" }),
      );
      assert.equal(backup.kind, "manual");
      const file = await authenticated.get(
        `/api/backups/download?id=${backup.id}`,
      );
      assert.equal(file.status(), 200);
      assert.match(
        file.headers()["content-type"] ?? "",
        /application\/vnd\.sqlite3/u,
      );
      const bytes = await file.body();
      assert.equal(bytes.byteLength, backup.sizeBytes);
      assert.ok(
        bytes.byteLength > 10 * 1024 * 1024,
        "The upload must cross Next's former 10 MiB proxy body limit.",
      );
      assert.equal(
        bytes.subarray(0, 16).toString("ascii"),
        "SQLite format 3\u0000",
      );
      backupHash = createHash("sha256").update(bytes).digest("hex");
      const inspected = await json(
        await authenticated.post("/api/backups/inspect", {
          headers: {
            Origin: origin,
            "X-Workspace-Generation": await currentGeneration(authenticated),
            "Content-Type": "application/octet-stream",
          },
          data: bytes,
        }),
      );
      assert.equal(inspected.sha256, backupHash);
      assert.ok(inspected.summary.documentNotes >= 1);
      assert.ok(inspected.summary.resourceNotes >= 1);
      assert.equal(inspected.summary.audioClips, 2);
      assert.equal(inspected.summary.audioBytes, audioFixture.size * 2);
    },
  );

  async function verifyPersisted() {
    await waitReady(authenticated);
    const learning = await json(await authenticated.get("/api/learning"));
    assert.equal(
      learning.documents.find(
        (item) => item.moduleId === "01" && item.view === "cours",
      ).note.text,
      courseNote,
    );
    assert.equal(
      (await json(await authenticated.get("/api/resources?id=ulp-001"))).state
        .notes,
      resourceNote,
    );
    const file = await authenticated.get(
      `/api/backups/download?id=${backup.id}`,
    );
    assert.equal(file.status(), 200);
    assert.equal(
      createHash("sha256")
        .update(await file.body())
        .digest("hex"),
      backupHash,
    );
    const audio = await authenticated.head(`/api/audio/${audioFixture.ids[0]}`);
    assert.equal(audio.status(), 200);
    assert.equal(Number(audio.headers()["content-length"]), audioFixture.size);
  }

  await verify("notes and backup survive an application restart", async () => {
    await compose(["restart", "app"]);
    await verifyPersisted();
  });
  await verify(
    "notes and backup survive container replacement with the same private volume",
    async () => {
      await compose(["up", "-d", "--no-deps", "--force-recreate", "app"]);
      await verifyPersisted();
      const id = await compose(["ps", "-q", "app"]);
      const [container] = JSON.parse(await command(["inspect", id]));
      assert.equal(container.State.Running, true);
      assert.ok(
        container.Mounts.some(
          (mount) =>
            mount.Type === "volume" &&
            mount.Name === `${project}_app_data` &&
            mount.Destination === "/app/.data",
        ),
      );
      assert.deepEqual(container.HostConfig.PortBindings ?? {}, {});
      const output = await compose([
        "exec",
        "-T",
        "app",
        "node",
        "--input-type=module",
        "-e",
        `
      import assert from "node:assert/strict";
      import {statSync} from "node:fs";
      import {join} from "node:path";
      assert.notEqual(process.getuid(),0,"The app must run without root privileges.");
      const directory = statSync(process.env.APP_DATA_DIR);
      const database = statSync(join(process.env.APP_DATA_DIR,"learning.sqlite3"));
      assert.equal(directory.mode & 0o777,0o700);
      assert.equal(database.mode & 0o777,0o600);
      assert.equal(database.uid,process.getuid());
      console.log("private-volume-checks-passed");
    `,
      ]);
      assert.equal(output, "private-volume-checks-passed");
    },
  );
} catch (error) {
  process.exitCode = interrupted ? 130 : 1;
  console.error(redact(error instanceof Error ? error.stack : error));
  if (started && !interrupted) {
    const logs = await compose(
      ["logs", "--no-color", "--tail", "40", "app", "caddy"],
      { cleaning: true },
    ).catch(() => "");
    if (logs) console.error(redact(logs));
  }
} finally {
  try {
    await cleanup();
  } catch (error) {
    process.exitCode = 1;
    console.error(redact(error));
  }
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}

if (!process.exitCode)
  console.log(
    `Hosting integration: ${passed} checks passed; disposable containers, volumes and credentials removed.`,
  );

import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRequestAccess,
  assertRequestOrigin,
  RequestAccessError,
  type RequestAccessEnvironment,
} from "../../src/lib/server/request-access.ts";

const environment: RequestAccessEnvironment = {
  APP_ORIGIN: "https://ukrainian.example.test",
  APP_PROXY_SECRET: "a1".repeat(32),
};
function request(
  headers: Record<string, string> = {},
  url = "http://127.0.0.1:3000/api/learning",
) {
  return new Request(url, { headers });
}
function hosted(headers: Record<string, string> = {}) {
  return request({
    host: "ukrainian.example.test",
    "x-app-proxy-secret": environment.APP_PROXY_SECRET!,
    ...headers,
  });
}
function error(status: number, code: RequestAccessError["code"]) {
  return (failure: unknown) => {
    assert.ok(failure instanceof RequestAccessError);
    assert.equal(failure.status, status);
    assert.equal(failure.code, code);
    assert.ok(!failure.message.includes(environment.APP_PROXY_SECRET!));
    return true;
  };
}

test("local access preserves loopback hosts and explicit ports without hosted configuration", () => {
  for (const host of [
    "localhost",
    "localhost:3000",
    "127.0.0.1:3000",
    "[::1]:3000",
  ])
    assert.deepEqual(assertRequestAccess(request({ host }), {}), {
      mode: "local",
      origin: `http://${host}`,
    });
  assert.deepEqual(
    assertRequestAccess(
      request(
        { host: "localhost:3443" },
        "https://localhost:3443/api/learning",
      ),
      {},
    ),
    { mode: "local", origin: "https://localhost:3443" },
  );
});

test("local access rejects non-loopback and malformed hosts without throwing URL errors", () => {
  for (const host of [
    "",
    "192.168.1.20:3000",
    "example.test",
    "localhost.evil.test",
    "user@localhost:3000",
    "localhost:99999",
    "localhost:3000/path",
    "[::1",
    "localhost,evil.test",
  ])
    assert.throws(
      () => assertRequestAccess(request({ host }), {}),
      error(403, "ACCESS_DENIED"),
    );
  assert.throws(
    () => assertRequestAccess(request(), {}),
    error(403, "ACCESS_DENIED"),
  );
  assert.throws(
    () =>
      assertRequestAccess(
        {
          headers: new Headers({ host: "localhost:3000" }),
          url: "invalid url",
        } as Request,
        {},
      ),
    error(403, "ACCESS_DENIED"),
  );
  assert.throws(
    () =>
      assertRequestAccess(
        request({ host: "localhost" }, "ftp://localhost/resource"),
        {},
      ),
    error(403, "ACCESS_DENIED"),
  );
});

test("hosted access uses the configured HTTPS origin despite the internal HTTP URL", () => {
  assert.deepEqual(assertRequestAccess(hosted(), environment), {
    mode: "hosted",
    origin: environment.APP_ORIGIN,
  });
  const withPort = {
    ...environment,
    APP_ORIGIN: "https://ukrainian.example.test:8443",
  };
  assert.deepEqual(
    assertRequestAccess(
      hosted({ host: "ukrainian.example.test:8443" }),
      withPort,
    ),
    { mode: "hosted", origin: withPort.APP_ORIGIN },
  );
  assert.throws(
    () =>
      assertRequestAccess(
        hosted({ host: "ukrainian.example.test:443" }),
        environment,
      ),
    error(403, "ACCESS_DENIED"),
  );
});

test("hosted requests require the exact proxy secret even for the loopback backend", () => {
  assert.throws(
    () =>
      assertRequestAccess(
        request({ host: "ukrainian.example.test" }),
        environment,
      ),
    error(403, "ACCESS_DENIED"),
  );
  for (const secret of [
    "",
    "b2".repeat(32),
    "a1".repeat(31),
    "a1".repeat(33),
    "A1".repeat(32),
    `${environment.APP_PROXY_SECRET},attacker`,
  ])
    assert.throws(
      () =>
        assertRequestAccess(
          hosted({ "x-app-proxy-secret": secret }),
          environment,
        ),
      error(403, "ACCESS_DENIED"),
    );
  assert.throws(
    () => assertRequestAccess(hosted({ host: "localhost:3000" }), environment),
    error(403, "ACCESS_DENIED"),
  );
});

test("forwarded host and protocol cannot satisfy or weaken either access mode", () => {
  const forwarded = {
    "x-forwarded-host": "ukrainian.example.test",
    "x-forwarded-proto": "https",
    forwarded: "for=127.0.0.1;host=ukrainian.example.test;proto=https",
  };
  assert.throws(
    () =>
      assertRequestAccess(
        hosted({ host: "evil.test", ...forwarded }),
        environment,
      ),
    error(403, "ACCESS_DENIED"),
  );
  assert.throws(
    () =>
      assertRequestAccess(
        request({ host: "ukrainian.example.test", ...forwarded }),
        environment,
      ),
    error(403, "ACCESS_DENIED"),
  );
  assert.throws(
    () =>
      assertRequestAccess(
        request({
          host: "evil.test",
          "x-forwarded-host": "localhost:3000",
          "x-forwarded-proto": "http",
        }),
        {},
      ),
    error(403, "ACCESS_DENIED"),
  );
  assert.deepEqual(
    assertRequestAccess(
      hosted({ "x-forwarded-host": "evil.test", "x-forwarded-proto": "http" }),
      environment,
    ),
    { mode: "hosted", origin: environment.APP_ORIGIN },
  );
});

test("partial and noncanonical hosted configuration fails closed rather than enabling local access", () => {
  const invalid: RequestAccessEnvironment[] = [
    { APP_ORIGIN: "" },
    { APP_PROXY_SECRET: "" },
    { APP_ORIGIN: environment.APP_ORIGIN },
    { APP_PROXY_SECRET: environment.APP_PROXY_SECRET },
    ...["", "short", "x".repeat(64), "a".repeat(63), "a".repeat(65)].map(
      (APP_PROXY_SECRET) => ({ ...environment, APP_PROXY_SECRET }),
    ),
    ...[
      "invalid",
      "http://ukrainian.example.test",
      "https://ukrainian.example.test/",
      "https://ukrainian.example.test/path",
      "https://ukrainian.example.test?query=1",
      "https://ukrainian.example.test#fragment",
      "https://user:password@ukrainian.example.test",
      "https://UKRAINIAN.example.test",
      "https://ukrainian.example.test:443",
      " https://ukrainian.example.test",
    ].map((APP_ORIGIN) => ({ ...environment, APP_ORIGIN })),
  ];
  for (const config of invalid) {
    assert.throws(
      () => assertRequestAccess(request({ host: "localhost:3000" }), config),
      error(503, "ACCESS_CONFIGURATION_INVALID"),
    );
    assert.throws(
      () => assertRequestAccess(hosted(), config),
      error(503, "ACCESS_CONFIGURATION_INVALID"),
    );
  }
});

test("read requests allow absent origin but reject any supplied foreign or null origin", () => {
  for (const config of [{}, environment]) {
    const base = Object.keys(config).length
      ? hosted()
      : request({ host: "localhost:3000" });
    const access = assertRequestAccess(base, config);
    assert.doesNotThrow(() => assertRequestOrigin(base, access));
    for (const origin of [
      "",
      "null",
      "https://evil.test",
      `${access.origin}/`,
      "https://ukrainian.example.test.evil.test",
    ])
      assert.throws(
        () => assertRequestOrigin(request({ origin }), access),
        error(403, "ORIGIN_DENIED"),
      );
    assert.doesNotThrow(() =>
      assertRequestOrigin(request({ origin: access.origin }), access),
    );
  }
});

test("mutations require exact configured origin and reject cross-site fetches even with a valid secret", () => {
  const access = assertRequestAccess(hosted(), environment);
  const headersCases: Record<string, string>[] = [
    {},
    { origin: "http://ukrainian.example.test" },
    { origin: "http://127.0.0.1:3000" },
    {
      origin: "https://evil.test",
      "x-forwarded-origin": environment.APP_ORIGIN!,
    },
    { origin: environment.APP_ORIGIN!, "sec-fetch-site": "cross-site" },
    { origin: environment.APP_ORIGIN!, "sec-fetch-site": "Cross-Site" },
  ];
  for (const headers of headersCases)
    assert.throws(
      () => assertRequestOrigin(hosted(headers), access, true),
      error(403, "ORIGIN_DENIED"),
    );
  assert.doesNotThrow(() =>
    assertRequestOrigin(
      hosted({
        origin: environment.APP_ORIGIN!,
        "sec-fetch-site": "same-origin",
      }),
      access,
      true,
    ),
  );
  assert.throws(
    () =>
      assertRequestOrigin(hosted({ "sec-fetch-site": "cross-site" }), access),
    error(403, "ORIGIN_DENIED"),
  );
});

test("local mutations still require same origin including the port", () => {
  const access = assertRequestAccess(request({ host: "localhost:3000" }), {});
  assert.doesNotThrow(() =>
    assertRequestOrigin(
      request({ origin: "http://localhost:3000" }),
      access,
      true,
    ),
  );
  for (const origin of [
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "https://localhost:3000",
    "null",
  ])
    assert.throws(
      () => assertRequestOrigin(request({ origin }), access, true),
      error(403, "ORIGIN_DENIED"),
    );
  assert.throws(
    () => assertRequestOrigin(request(), access, true),
    error(403, "ORIGIN_DENIED"),
  );
});

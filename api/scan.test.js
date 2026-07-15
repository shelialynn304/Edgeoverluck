const assert = require("node:assert/strict");
const test = require("node:test");

const handler = require("./scan.js");

function makeResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function makeRequest() {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://edgeoverluck.com",
      "cf-connecting-ip": "203.0.113.10",
    },
    body: {
      image_base64: jpeg.toString("base64"),
      media_type: "image/jpeg",
      turnstile_token: null,
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function withEnvironment(values, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("successful scan is rate-limited and quota-reserved before Anthropic", { concurrency: false }, async () => {
  await withEnvironment(
    {
      ANTHROPIC_API_KEY: "test-key",
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
      TURNSTILE_SITE_KEY: null,
      TURNSTILE_SECRET_KEY: null,
      SCAN_SECURITY_DISABLED: null,
      SCAN_SECURITY_FAIL_OPEN: null,
    },
    async () => {
      const calls = [];
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        calls.push(String(url));
        if (String(url) === "https://redis.example") {
          const invocation = calls.filter((item) => item === "https://redis.example").length;
          return {
            ok: true,
            json: async () => ({
              result: invocation === 1 ? [1, 1, 60, 1, 3600] : [1, 1, 86400, 1, 86400],
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  source_type: "tote_board",
                  horses: [{ number: 1, odds_display: "5/2", confidence: "high" }],
                  pools: { win: null, exacta: null, trifecta: null },
                  notes: "",
                }),
              },
            ],
          }),
        };
      };

      try {
        const res = makeResponse();
        await handler(makeRequest(), res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.horses[0].number, 1);
        assert.deepEqual(calls, [
          "https://redis.example",
          "https://redis.example",
          "https://api.anthropic.com/v1/messages",
        ]);
        assert.equal(res.headers["X-RateLimit-Remaining"], "4");
        assert.equal(res.headers["X-DailyQuota-Remaining"], "39");
      } finally {
        global.fetch = originalFetch;
      }
    },
  );
});

test("blocked burst limit returns 429 without calling Anthropic", { concurrency: false }, async () => {
  await withEnvironment(
    {
      ANTHROPIC_API_KEY: "test-key",
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
      TURNSTILE_SITE_KEY: null,
      TURNSTILE_SECRET_KEY: null,
      SCAN_SECURITY_DISABLED: null,
      SCAN_SECURITY_FAIL_OPEN: null,
    },
    async () => {
      const calls = [];
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        calls.push(String(url));
        return { ok: true, json: async () => ({ result: [0, 1, 5, 45] }) };
      };
      try {
        const res = makeResponse();
        await handler(makeRequest(), res);
        assert.equal(res.statusCode, 429);
        assert.equal(res.body.code, "rate_limited");
        assert.equal(calls.length, 1);
        assert.ok(Number(res.headers["Retry-After"]) >= 1);
      } finally {
        global.fetch = originalFetch;
      }
    },
  );
});

test("missing Redis configuration fails closed", { concurrency: false }, async () => {
  await withEnvironment(
    {
      ANTHROPIC_API_KEY: "test-key",
      UPSTASH_REDIS_REST_URL: null,
      UPSTASH_REDIS_REST_TOKEN: null,
      TURNSTILE_SITE_KEY: null,
      TURNSTILE_SECRET_KEY: null,
      SCAN_SECURITY_DISABLED: null,
      SCAN_SECURITY_FAIL_OPEN: null,
    },
    async () => {
      const res = makeResponse();
      await handler(makeRequest(), res);
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.code, "security_not_configured");
    },
  );
});

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDailyQuotaLimits,
  buildIpRateLimits,
  getClientIp,
  getSecurityConfig,
  hashIdentifier,
  hasImageSignature,
  validateImagePayload,
  validateRequestMetadata,
} = require("./security.js");

function request(headers = {}) {
  return { headers, socket: { remoteAddress: "127.0.0.1" } };
}

test("client IP prefers Cloudflare and normalizes forwarded lists", () => {
  assert.equal(getClientIp(request({ "cf-connecting-ip": "203.0.113.10" })), "203.0.113.10");
  assert.equal(getClientIp(request({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" })), "198.51.100.4");
});

test("IP identifiers are hashed and stable", () => {
  const first = hashIdentifier("203.0.113.10");
  const second = hashIdentifier("203.0.113.10");
  assert.equal(first, second);
  assert.equal(first.length, 32);
  assert.notEqual(first, "203.0.113.10");
});

test("request metadata blocks cross-site and unapproved origins", () => {
  const config = getSecurityConfig({ SCAN_SECURITY_DISABLED: "true" });
  assert.throws(
    () => validateRequestMetadata(request({ "content-type": "application/json", "sec-fetch-site": "cross-site" }), config),
    /Cross-site/,
  );
  assert.throws(
    () => validateRequestMetadata(request({ "content-type": "application/json", origin: "https://evil.example" }), config),
    /origin is not allowed/,
  );
  assert.doesNotThrow(() =>
    validateRequestMetadata(
      request({ "content-type": "application/json; charset=utf-8", origin: "https://edgeoverluck.com" }),
      config,
    ),
  );
});

test("image signature checks match declared media type", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const gif = Buffer.from("GIF89a0000", "ascii");
  const webp = Buffer.from("RIFF0000WEBP", "ascii");
  assert.equal(hasImageSignature(jpeg, "image/jpeg"), true);
  assert.equal(hasImageSignature(png, "image/png"), true);
  assert.equal(hasImageSignature(gif, "image/gif"), true);
  assert.equal(hasImageSignature(webp, "image/webp"), true);
  assert.equal(hasImageSignature(jpeg, "image/png"), false);
});

test("validated images are normalized and mismatches are rejected", () => {
  const config = getSecurityConfig({ SCAN_SECURITY_DISABLED: "true", SCAN_MAX_IMAGE_BYTES: "1024" });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const result = validateImagePayload(jpeg.toString("base64"), "image/jpeg", config);
  assert.equal(result.buffer.length, jpeg.length);
  assert.equal(result.normalizedBase64, jpeg.toString("base64"));
  assert.throws(() => validateImagePayload(jpeg.toString("base64"), "image/png", config), /do not match/);
  assert.throws(() => validateImagePayload("%%%", "image/jpeg", config), /valid base64/);
});

test("rate and quota keys use separate fixed windows", () => {
  const config = getSecurityConfig({
    SCAN_RATE_LIMIT_PER_MINUTE: "7",
    SCAN_RATE_LIMIT_PER_HOUR: "25",
    SCAN_DAILY_IP_QUOTA: "50",
    SCAN_DAILY_GLOBAL_QUOTA: "500",
  });
  const now = Date.UTC(2026, 6, 15, 12, 0, 0);
  const ipHash = hashIdentifier("203.0.113.10");
  const rates = buildIpRateLimits(ipHash, now, config);
  const quotas = buildDailyQuotaLimits(ipHash, now, config);
  assert.deepEqual(rates.map((item) => item.limit), [7, 25]);
  assert.deepEqual(quotas.map((item) => item.limit), [50, 500]);
  assert.match(rates[0].key, /:minute:/);
  assert.match(rates[1].key, /:hour:/);
  assert.match(quotas[0].key, /:day:/);
  assert.match(quotas[1].key, /global:day:/);
});

test("partial Turnstile configuration is detected", () => {
  const partial = getSecurityConfig({ TURNSTILE_SITE_KEY: "site-only" });
  assert.equal(partial.turnstilePartiallyConfigured, true);
  assert.equal(partial.turnstileEnabled, false);
  const complete = getSecurityConfig({ TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" });
  assert.equal(complete.turnstilePartiallyConfigured, false);
  assert.equal(complete.turnstileEnabled, true);
});

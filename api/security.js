const crypto = require("node:crypto");

const DEFAULT_ALLOWED_ORIGINS = ["https://edgeoverluck.com", "https://www.edgeoverluck.com"];
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const FIXED_WINDOW_SCRIPT = `
local key_count = #KEYS
for i = 1, key_count do
  local limit = tonumber(ARGV[((i - 1) * 2) + 1])
  local current = tonumber(redis.call("GET", KEYS[i]) or "0")
  if current + 1 > limit then
    local ttl = redis.call("TTL", KEYS[i])
    return {0, i, current, ttl}
  end
end

local result = {1}
for i = 1, key_count do
  local ttl_seconds = tonumber(ARGV[((i - 1) * 2) + 2])
  local count = redis.call("INCR", KEYS[i])
  if count == 1 then
    redis.call("EXPIRE", KEYS[i], ttl_seconds)
  end
  table.insert(result, count)
  table.insert(result, redis.call("TTL", KEYS[i]))
end
return result
`;

class SecurityError extends Error {
  constructor(message, status = 400, code = "security_error", options = {}) {
    super(message);
    this.name = "SecurityError";
    this.status = status;
    this.code = code;
    this.retryAfter = options.retryAfter || null;
    this.details = options.details || null;
  }
}

function parsePositiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseCsv(value, fallback = []) {
  if (!value || typeof value !== "string") return fallback.slice();
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSecurityConfig(env = process.env) {
  const allowedOrigins = parseCsv(env.SCAN_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
  const allowedHostnames = parseCsv(
    env.TURNSTILE_EXPECTED_HOSTNAMES,
    allowedOrigins.map((origin) => {
      try {
        return new URL(origin).hostname;
      } catch {
        return "";
      }
    }).filter(Boolean),
  );

  const turnstileSiteKey = env.TURNSTILE_SITE_KEY || "";
  const turnstileSecretKey = env.TURNSTILE_SECRET_KEY || "";
  const turnstilePartiallyConfigured = Boolean(turnstileSiteKey) !== Boolean(turnstileSecretKey);

  return {
    disabled: env.SCAN_SECURITY_DISABLED === "true",
    failOpen: env.SCAN_SECURITY_FAIL_OPEN === "true",
    redisUrl: (env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, ""),
    redisToken: env.UPSTASH_REDIS_REST_TOKEN || "",
    allowedOrigins,
    allowedHostnames,
    requireOrigin: env.SCAN_REQUIRE_ORIGIN === "true",
    maxImageBytes: parsePositiveInt(env.SCAN_MAX_IMAGE_BYTES, 8 * 1024 * 1024, 1024, 20 * 1024 * 1024),
    perMinute: parsePositiveInt(env.SCAN_RATE_LIMIT_PER_MINUTE, 5, 1, 1000),
    perHour: parsePositiveInt(env.SCAN_RATE_LIMIT_PER_HOUR, 20, 1, 10000),
    perIpDaily: parsePositiveInt(env.SCAN_DAILY_IP_QUOTA, 40, 1, 100000),
    globalDaily: parsePositiveInt(env.SCAN_DAILY_GLOBAL_QUOTA, 400, 1, 1000000),
    redisTimeoutMs: parsePositiveInt(env.SCAN_REDIS_TIMEOUT_MS, 2500, 250, 15000),
    turnstileTimeoutMs: parsePositiveInt(env.TURNSTILE_TIMEOUT_MS, 5000, 500, 20000),
    turnstileSiteKey,
    turnstileSecretKey,
    turnstileEnabled: Boolean(turnstileSiteKey && turnstileSecretKey),
    turnstilePartiallyConfigured,
    turnstileAction: env.TURNSTILE_EXPECTED_ACTION || "scan_odds",
  };
}

function firstHeader(req, name) {
  const headers = req && req.headers ? req.headers : {};
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (Array.isArray(direct)) return direct[0] || "";
  return typeof direct === "string" ? direct : "";
}

function normalizeIp(candidate) {
  if (!candidate || typeof candidate !== "string") return "unknown";
  const first = candidate.split(",")[0].trim();
  return first || "unknown";
}

function getClientIp(req) {
  return normalizeIp(
    firstHeader(req, "cf-connecting-ip") ||
      firstHeader(req, "x-real-ip") ||
      firstHeader(req, "x-forwarded-for") ||
      (req && req.socket && req.socket.remoteAddress) ||
      "unknown",
  );
}

function hashIdentifier(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
}

function setSecurityHeaders(res, requestId) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (requestId) res.setHeader("X-Request-Id", requestId);
}

function validateRequestMetadata(req, config) {
  const contentType = firstHeader(req, "content-type").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new SecurityError("Content-Type must be application/json.", 415, "unsupported_content_type");
  }

  const fetchSite = firstHeader(req, "sec-fetch-site").toLowerCase();
  if (fetchSite === "cross-site") {
    throw new SecurityError("Cross-site scan requests are not allowed.", 403, "cross_site_request");
  }

  const origin = firstHeader(req, "origin");
  if (!origin && config.requireOrigin) {
    throw new SecurityError("Request origin is required.", 403, "missing_origin");
  }
  if (origin && !config.allowedOrigins.includes(origin)) {
    throw new SecurityError("Request origin is not allowed.", 403, "origin_not_allowed");
  }

  const contentLength = Number.parseInt(firstHeader(req, "content-length"), 10);
  const maxJsonBytes = Math.ceil(config.maxImageBytes * 1.4) + 16 * 1024;
  if (Number.isFinite(contentLength) && contentLength > maxJsonBytes) {
    throw new SecurityError("Request body is too large.", 413, "request_too_large");
  }
}

function hasImageSignature(buffer, mediaType) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (mediaType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mediaType === "image/png") {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
  }
  if (mediaType === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (mediaType === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

function validateImagePayload(imageBase64, mediaType, config) {
  const allowedMediaTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!imageBase64 || typeof imageBase64 !== "string") {
    throw new SecurityError("No image provided.", 400, "missing_image");
  }
  if (!allowedMediaTypes.has(mediaType)) {
    throw new SecurityError("Unsupported image type.", 400, "unsupported_image_type");
  }
  if (imageBase64.startsWith("data:") || /\s/.test(imageBase64)) {
    throw new SecurityError("Image data is malformed.", 400, "malformed_image");
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(imageBase64) || imageBase64.length % 4 !== 0) {
    throw new SecurityError("Image data is not valid base64.", 400, "invalid_base64");
  }
  if (imageBase64.length > Math.ceil(config.maxImageBytes * 4 / 3) + 4) {
    throw new SecurityError("Image is too large.", 413, "image_too_large");
  }

  const buffer = Buffer.from(imageBase64, "base64");
  if (buffer.length === 0) {
    throw new SecurityError("Image is empty.", 400, "empty_image");
  }
  if (buffer.length > config.maxImageBytes) {
    throw new SecurityError("Image is too large.", 413, "image_too_large");
  }
  if (!hasImageSignature(buffer, mediaType)) {
    throw new SecurityError("Image contents do not match the declared file type.", 400, "image_signature_mismatch");
  }

  return { buffer, normalizedBase64: buffer.toString("base64") };
}

function getWindow(nowMs, seconds) {
  const nowSeconds = Math.floor(nowMs / 1000);
  const bucket = Math.floor(nowSeconds / seconds);
  const resetAt = (bucket + 1) * seconds;
  return { bucket, resetAt, retryAfter: Math.max(1, resetAt - nowSeconds) };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function redisEval(config, keys, args) {
  if (!config.redisUrl || !config.redisToken) {
    throw new SecurityError("Scan protection storage is not configured.", 503, "security_not_configured");
  }

  let response;
  try {
    response = await fetchWithTimeout(
      config.redisUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.redisToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(["EVAL", FIXED_WINDOW_SCRIPT, keys.length, ...keys, ...args]),
      },
      config.redisTimeoutMs,
    );
  } catch (error) {
    throw new SecurityError("Scan protection is temporarily unavailable.", 503, "security_unavailable");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SecurityError("Scan protection returned an invalid response.", 503, "security_unavailable");
  }
  if (!response.ok || payload.error || !Array.isArray(payload.result)) {
    throw new SecurityError("Scan protection rejected the request.", 503, "security_unavailable");
  }
  return payload.result.map((value) => Number(value));
}

async function consumeFixedWindows(config, limits) {
  if (config.disabled) {
    return { allowed: true, disabled: true, windows: [] };
  }

  try {
    const keys = limits.map((limit) => limit.key);
    const args = limits.flatMap((limit) => [limit.limit, limit.ttlSeconds]);
    const result = await redisEval(config, keys, args);
    if (result[0] === 0) {
      const blockedIndex = Math.max(0, result[1] - 1);
      const blocked = limits[blockedIndex];
      const retryAfter = blocked.retryAfter;
      return {
        allowed: false,
        blocked,
        retryAfter,
        windows: [],
      };
    }

    const windows = limits.map((limit, index) => {
      const count = result[1 + index * 2];
      return {
        ...limit,
        count,
        remaining: Math.max(0, limit.limit - count),
        retryAfter: limit.retryAfter,
      };
    });
    return { allowed: true, disabled: false, windows };
  } catch (error) {
    if (config.failOpen) {
      console.warn("Scan security failed open:", error.code || error.message);
      return { allowed: true, failedOpen: true, windows: [] };
    }
    throw error;
  }
}

function buildIpRateLimits(ipHash, nowMs, config) {
  const minute = getWindow(nowMs, 60);
  const hour = getWindow(nowMs, 60 * 60);
  return [
    {
      name: "minute",
      key: `eol:scan:ip:${ipHash}:minute:${minute.bucket}`,
      limit: config.perMinute,
      ttlSeconds: 120,
      retryAfter: minute.retryAfter,
    },
    {
      name: "hour",
      key: `eol:scan:ip:${ipHash}:hour:${hour.bucket}`,
      limit: config.perHour,
      ttlSeconds: 2 * 60 * 60,
      retryAfter: hour.retryAfter,
    },
  ];
}

function buildDailyQuotaLimits(ipHash, nowMs, config) {
  const day = getWindow(nowMs, 24 * 60 * 60);
  return [
    {
      name: "ip-daily",
      key: `eol:scan:ip:${ipHash}:day:${day.bucket}`,
      limit: config.perIpDaily,
      ttlSeconds: 2 * 24 * 60 * 60,
      retryAfter: day.retryAfter,
    },
    {
      name: "global-daily",
      key: `eol:scan:global:day:${day.bucket}`,
      limit: config.globalDaily,
      ttlSeconds: 2 * 24 * 60 * 60,
      retryAfter: day.retryAfter,
    },
  ];
}

function applyLimitHeaders(res, result, prefix = "X-RateLimit") {
  if (!result || !Array.isArray(result.windows) || result.windows.length === 0) return;
  const tightest = result.windows.reduce((best, current) => {
    if (!best) return current;
    const bestRatio = best.remaining / best.limit;
    const currentRatio = current.remaining / current.limit;
    return currentRatio < bestRatio ? current : best;
  }, null);
  res.setHeader(`${prefix}-Limit`, String(tightest.limit));
  res.setHeader(`${prefix}-Remaining`, String(tightest.remaining));
  res.setHeader(`${prefix}-Reset`, String(Math.floor(Date.now() / 1000) + tightest.retryAfter));
}

async function verifyTurnstile(token, ip, config) {
  if (config.turnstilePartiallyConfigured) {
    throw new SecurityError("Bot protection is misconfigured.", 503, "turnstile_not_configured");
  }
  if (!config.turnstileEnabled || config.disabled) return { enabled: false };
  if (!token || typeof token !== "string" || token.length > 2048) {
    throw new SecurityError("Complete the security check and try again.", 403, "verification_required");
  }

  let response;
  try {
    response = await fetchWithTimeout(
      TURNSTILE_VERIFY_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: config.turnstileSecretKey,
          response: token,
          remoteip: ip === "unknown" ? undefined : ip,
        }),
      },
      config.turnstileTimeoutMs,
    );
  } catch {
    throw new SecurityError("Security verification is temporarily unavailable.", 503, "verification_unavailable");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SecurityError("Security verification returned an invalid response.", 503, "verification_unavailable");
  }

  const hostnameAllowed =
    config.allowedHostnames.length === 0 || config.allowedHostnames.includes(payload.hostname);
  const actionAllowed = !config.turnstileAction || payload.action === config.turnstileAction;
  if (!response.ok || !payload.success || !hostnameAllowed || !actionAllowed) {
    throw new SecurityError("Security verification failed. Please try again.", 403, "verification_failed");
  }

  return { enabled: true, hostname: payload.hostname || null };
}

function makeRequestId() {
  return crypto.randomUUID();
}

module.exports = {
  SecurityError,
  applyLimitHeaders,
  buildDailyQuotaLimits,
  buildIpRateLimits,
  consumeFixedWindows,
  getClientIp,
  getSecurityConfig,
  hashIdentifier,
  hasImageSignature,
  makeRequestId,
  setSecurityHeaders,
  validateImagePayload,
  validateRequestMetadata,
  verifyTurnstile,
};

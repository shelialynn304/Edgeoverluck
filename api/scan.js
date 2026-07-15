// Serverless proxy for the Anthropic vision API. The paid API key remains
// server-side. Requests are validated, rate-limited, quota-capped, and can be
// protected with Cloudflare Turnstile before the vision service is called.

const {
  SecurityError,
  applyLimitHeaders,
  buildDailyQuotaLimits,
  buildIpRateLimits,
  consumeFixedWindows,
  getClientIp,
  getSecurityConfig,
  hashIdentifier,
  makeRequestId,
  setSecurityHeaders,
  validateImagePayload,
  validateRequestMetadata,
  verifyTurnstile,
} = require("./security.js");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const ANTHROPIC_TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You are an odds-board reader for horse racing. Extract every horse number
and its displayed odds from the image. Respond with ONLY valid JSON, no
markdown fences, no commentary.

Schema:
{
  "source_type": "tote_board" | "adw_screenshot" | "program" | "tv_graphic" | "unknown",
  "horses": [
    {
      "number": <int>,
      "odds_display": "<string exactly as shown, e.g. '5/2', '9-2', '3', 'EVEN'>",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "pools": {
    "win": <int or null>,
    "exacta": <int or null>,
    "trifecta": <int or null>
  },
  "notes": "<anything ambiguous, scratched horses, partially visible entries>"
}

Rules:
- Report odds EXACTLY as displayed. Do not convert formats.
- If a horse is visible but odds are unreadable, include it with odds_display
  null and confidence "low".
- If the image is not a racing odds display, return {"error": "not_odds_display"}.
- Mark confidence "medium" or "low" for glare, blur, cut-off digits, or LED
  banding. Never guess a digit silently.`;

function sendJson(res, status, body) {
  return res.status(status).json(body);
}

function extractJson(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(candidate);
}

async function fetchAnthropic(apiKey, imageBase64, mediaType) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
  try {
    return await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              { type: "text", text: "Extract the odds board data as JSON." },
            ],
          },
        ],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function handler(req, res) {
  const requestId = makeRequestId();
  setSecurityHeaders(res, requestId);

  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
    }

    const config = getSecurityConfig();
    validateRequestMetadata(req, config);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new SecurityError("Server is not configured. Missing API key.", 503, "anthropic_not_configured");
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const imageBase64 = body.image_base64;
    const mediaType = body.media_type;
    const { normalizedBase64 } = validateImagePayload(imageBase64, mediaType, config);

    const ip = getClientIp(req);
    const ipHash = hashIdentifier(ip);
    const now = Date.now();

    const rateResult = await consumeFixedWindows(config, buildIpRateLimits(ipHash, now, config));
    if (!rateResult.allowed) {
      throw new SecurityError("Too many scan attempts. Try again later.", 429, "rate_limited", {
        retryAfter: rateResult.retryAfter,
      });
    }
    applyLimitHeaders(res, rateResult, "X-RateLimit");

    await verifyTurnstile(body.turnstile_token, ip, config);

    const quotaResult = await consumeFixedWindows(config, buildDailyQuotaLimits(ipHash, now, config));
    if (!quotaResult.allowed) {
      const isGlobal = quotaResult.blocked && quotaResult.blocked.name === "global-daily";
      throw new SecurityError(
        isGlobal
          ? "The scanner has reached today's service limit. Try again tomorrow."
          : "You have reached today's scan limit. Try again tomorrow.",
        429,
        isGlobal ? "global_quota_exceeded" : "daily_quota_exceeded",
        { retryAfter: quotaResult.retryAfter },
      );
    }
    applyLimitHeaders(res, quotaResult, "X-DailyQuota");

    let anthropicResponse;
    try {
      anthropicResponse = await fetchAnthropic(apiKey, normalizedBase64, mediaType);
    } catch (error) {
      console.error("Vision service request failed", { requestId, reason: error && error.name });
      return sendJson(res, 502, { error: "Could not reach the vision service.", code: "vision_unavailable" });
    }

    if (!anthropicResponse.ok) {
      console.error("Vision service returned an error", { requestId, status: anthropicResponse.status });
      return sendJson(res, 502, { error: "Vision service returned an error.", code: "vision_error" });
    }

    let anthropicBody;
    try {
      anthropicBody = await anthropicResponse.json();
    } catch {
      return sendJson(res, 502, {
        error: "Vision service returned an unreadable response.",
        code: "vision_bad_response",
      });
    }

    const textBlock = (anthropicBody.content || []).find((block) => block.type === "text");
    if (!textBlock || typeof textBlock.text !== "string") {
      return sendJson(res, 502, { error: "Vision service returned no content.", code: "vision_no_content" });
    }

    let extracted;
    try {
      extracted = extractJson(textBlock.text);
    } catch {
      return sendJson(res, 502, {
        error: "Could not parse the extraction result.",
        code: "vision_parse_error",
      });
    }

    return sendJson(res, 200, extracted);
  } catch (error) {
    if (error instanceof SecurityError) {
      if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
      return sendJson(res, error.status, { error: error.message, code: error.code });
    }

    console.error("Unexpected scanner error", { requestId, reason: error && error.message });
    return sendJson(res, 500, { error: "Unexpected scanner error.", code: "internal_error" });
  }
};

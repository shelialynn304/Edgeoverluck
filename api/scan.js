// Serverless proxy for the Anthropic vision API. Deploy this file as a
// serverless function (e.g. Vercel's /api convention). The Anthropic API
// key lives only in the function's environment — never sent to the client.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB, well under the API's limit

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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
  res.status(status).json(body);
}

function extractJson(text) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(candidate);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: "Server is not configured. Missing API key." });
  }

  const { image_base64: imageBase64, media_type: mediaType } = req.body || {};

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return sendJson(res, 400, { error: "No image provided." });
  }
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return sendJson(res, 400, { error: "Unsupported image type." });
  }
  if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
    return sendJson(res, 400, { error: "Image is too large." });
  }

  let anthropicResponse;
  try {
    anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
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
  } catch (err) {
    return sendJson(res, 502, { error: "Could not reach the vision service." });
  }

  if (!anthropicResponse.ok) {
    return sendJson(res, 502, { error: "Vision service returned an error." });
  }

  let anthropicBody;
  try {
    anthropicBody = await anthropicResponse.json();
  } catch (err) {
    return sendJson(res, 502, { error: "Vision service returned an unreadable response." });
  }

  const textBlock = (anthropicBody.content || []).find((b) => b.type === "text");
  if (!textBlock) {
    return sendJson(res, 502, { error: "Vision service returned no content." });
  }

  let extracted;
  try {
    extracted = extractJson(textBlock.text);
  } catch (err) {
    return sendJson(res, 502, { error: "Could not parse the extraction result." });
  }

  return sendJson(res, 200, extracted);
};

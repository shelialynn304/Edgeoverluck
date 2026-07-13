// Calls the serverless proxy (api/scan.js) with a base64 image and parses
// the structured JSON response. The Anthropic API key never touches the
// browser — only the proxy talks to Anthropic.

export class ScanError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/**
 * Reads a File/Blob into a { base64, mediaType } pair.
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.substring(result.indexOf(",") + 1);
      resolve({ base64, mediaType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new ScanError("Could not read image file.", "read_failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Sends the image to /api/scan and returns the parsed extraction JSON:
 * { source_type, horses, pools, notes }
 */
export async function scanOddsImage({ base64, mediaType }) {
  let response;
  try {
    response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: base64, media_type: mediaType }),
    });
  } catch (err) {
    throw new ScanError("Could not reach the scanning service. Check your connection.", "network");
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw new ScanError("The scanning service returned an unexpected response.", "bad_response");
  }

  if (!response.ok) {
    throw new ScanError(payload.error || "Scan failed. Please try again.", payload.code || "server_error");
  }

  if (payload.error === "not_odds_display") {
    throw new ScanError("That doesn't look like a racing odds display. Try a clearer photo of a tote board, ADW screen, or program.", "not_odds_display");
  }

  if (!Array.isArray(payload.horses) || payload.horses.length === 0) {
    throw new ScanError("No horses could be read from that image. Try a clearer photo.", "no_horses");
  }

  return payload;
}

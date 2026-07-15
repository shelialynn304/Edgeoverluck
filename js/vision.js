// Calls the protected serverless scanner proxy. The Anthropic API key and
// security credentials never touch the browser.

export class ScanError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

let scanConfigPromise = null;
let turnstileScriptPromise = null;

/** Reads a File/Blob into a { base64, mediaType } pair. */
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

async function getScanConfig() {
  if (!scanConfigPromise) {
    scanConfigPromise = fetch("/api/scan-config", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) {
        throw new ScanError(
          (payload && payload.error) || "Scanner security configuration is unavailable.",
          (payload && payload.code) || "security_config_unavailable",
        );
      }
      return payload;
    });
  }
  return scanConfigPromise;
}

function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => reject(new ScanError("Could not load the security check.", "verification_unavailable"));
      document.head.appendChild(script);
    });
  }
  return turnstileScriptPromise;
}

async function getTurnstileToken(config) {
  if (!config.turnstileRequired) return null;
  if (!config.turnstileSiteKey) {
    throw new ScanError("Scanner security is misconfigured.", "turnstile_not_configured");
  }

  const turnstile = await loadTurnstileScript();
  if (!turnstile || typeof turnstile.render !== "function") {
    throw new ScanError("Security verification is unavailable.", "verification_unavailable");
  }

  return new Promise((resolve, reject) => {
    const container = document.createElement("div");
    container.className = "scanner-turnstile";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);

    let widgetId = null;
    let settled = false;

    const cleanup = () => {
      if (widgetId !== null && typeof turnstile.remove === "function") {
        try {
          turnstile.remove(widgetId);
        } catch {
          // Widget may already have removed itself.
        }
      }
      container.remove();
    };

    const succeed = (token) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(token);
    };

    const fail = (message, code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new ScanError(message, code));
    };

    try {
      widgetId = turnstile.render(container, {
        sitekey: config.turnstileSiteKey,
        action: config.turnstileAction || "scan_odds",
        execution: "execute",
        appearance: "interaction-only",
        theme: "dark",
        callback: succeed,
        "error-callback": () => fail("Security verification failed. Please try again.", "verification_failed"),
        "expired-callback": () => fail("Security verification expired. Please try again.", "verification_expired"),
        "timeout-callback": () => fail("Security verification timed out. Please try again.", "verification_timeout"),
      });
      turnstile.execute(widgetId);
    } catch {
      fail("Could not start the security check.", "verification_unavailable");
    }
  });
}

/**
 * Sends the image to /api/scan and returns:
 * { source_type, horses, pools, notes }
 */
export async function scanOddsImage({ base64, mediaType }) {
  let config;
  let turnstileToken;
  try {
    config = await getScanConfig();
    turnstileToken = await getTurnstileToken(config);
  } catch (error) {
    if (error instanceof ScanError) throw error;
    throw new ScanError("Could not prepare the scanner security check.", "security_config_unavailable");
  }

  let response;
  try {
    response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: base64,
        media_type: mediaType,
        turnstile_token: turnstileToken,
      }),
    });
  } catch {
    throw new ScanError("Could not reach the scanning service. Check your connection.", "network");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ScanError("The scanning service returned an unexpected response.", "bad_response");
  }

  if (!response.ok) {
    throw new ScanError(payload.error || "Scan failed. Please try again.", payload.code || "server_error");
  }

  if (payload.error === "not_odds_display") {
    throw new ScanError(
      "That doesn't look like a racing odds display. Try a clearer photo of a tote board, ADW screen, or program.",
      "not_odds_display",
    );
  }

  if (!Array.isArray(payload.horses) || payload.horses.length === 0) {
    throw new ScanError("No horses could be read from that image. Try a clearer photo.", "no_horses");
  }

  return payload;
}

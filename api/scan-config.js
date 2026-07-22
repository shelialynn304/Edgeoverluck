const { getSecurityConfig, makeRequestId, setSecurityHeaders } = require("./security.js");

module.exports = function handler(req, res) {
  const requestId = makeRequestId();
  setSecurityHeaders(res, requestId);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed", code: "method_not_allowed" });
  }

  const config = getSecurityConfig();
  if (config.turnstilePartiallyConfigured) {
    return res.status(503).json({
      error: "Scanner security is misconfigured.",
      code: "turnstile_not_configured",
    });
  }

  return res.status(200).json({
    turnstileRequired: config.turnstileEnabled && !config.disabled,
    turnstileSiteKey: config.turnstileEnabled && !config.disabled ? config.turnstileSiteKey : null,
    turnstileAction: config.turnstileAction,
  });
};

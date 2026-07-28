export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, fromName, subject, html, attachments } = req.body || {};

  if (!to || !subject || !html) {
    return res.status(400).json({ error: "Missing required fields: to, subject, html" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Email service not configured (missing RESEND_API_KEY)" });
  }

  const from = fromName
    ? `${fromName} <schedule@gasbreaker.net>`
    : "Gas Breaker <schedule@gasbreaker.net>";

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments; // [{ filename, content (base64) }]
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000); // stay under Vercel's function limit

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    // Resend normally returns JSON, but guard against an empty/HTML body so a
    // parse failure doesn't masquerade as a generic 500.
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }

    if (!response.ok) {
      console.error("Resend error:", response.status, data);
      const detail = data.message || data.error || `Resend returned HTTP ${response.status}`;
      return res.status(response.status).json({ error: detail });
    }

    return res.status(200).json({ ok: true, id: data.id });
  } catch (err) {
    clearTimeout(timer);
    console.error("Send email exception:", err);
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "The email service timed out. Please try again." });
    }
    return res.status(500).json({ error: err.message || "Unexpected error contacting the email service." });
  }
}

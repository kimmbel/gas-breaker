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

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Resend error:", data);
      return res.status(response.status).json({ error: data.message || "Failed to send email" });
    }

    return res.status(200).json({ ok: true, id: data.id });
  } catch (err) {
    console.error("Send email exception:", err);
    return res.status(500).json({ error: err.message || "Unexpected error" });
  }
}

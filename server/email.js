const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  if (required.some(key => !process.env[key])) return null;

  // Load Nodemailer only when SMTP has been configured. Missing credentials
  // therefore never prevent the student portal or notification system starting.
  const nodemailer = require("nodemailer");
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

async function sendStudentEmail({ to, title, message }) {
  try {
    const mailer = getTransporter();
    if (!mailer) {
      console.info("Email notification skipped: SMTP is not configured.");
      return { sent: false, reason: "not_configured" };
    }

    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    await mailer.sendMail({
      from,
      to,
      subject: `TSO Student Housing: ${title}`,
      text: `${title}\n\n${message}\n\nSign in to your TSO Student Housing portal to view the latest information.`,
      html: `<!doctype html><html><body style="margin:0;padding:32px;background:#f4f6f8;font-family:Arial,sans-serif;color:#18212b"><div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;padding:32px"><h1 style="color:#173b32;margin-top:0">TSO Student Housing</h1><h2>${escapeHtml(title)}</h2><p style="line-height:1.6">${escapeHtml(message).replace(/\n/g, "<br>")}</p><p style="line-height:1.6">Sign in to your TSO Student Housing portal to view the latest information.</p><hr style="border:0;border-top:1px solid #e5e7eb"><small style="color:#667085">This is an automated notification. Please do not reply to this email.</small></div></body></html>`
    });
    return { sent: true };
  } catch (error) {
    console.error("Student email notification failed:", error.message);
    return { sent: false, reason: "send_failed" };
  }
}

module.exports = { sendStudentEmail };

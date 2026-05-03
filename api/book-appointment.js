"use strict";

const { Resend } = require("resend");
const nodemailer = require("nodemailer");

const ADMIN_EMAILS = [
  "toothbudspediatricdentistry@gmail.com",
  "dr.priyatham@gmail.com",
  "pawan.tirupathi@gmail.com",
];

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const memoryRateLimit = new Map();

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed." });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res
      .status(429)
      .json({ message: "Too many requests. Please try again in a minute." });
  }

  try {
    const payload = normalizeBody(req.body);

    // Honeypot: silently accept and drop bot requests.
    if (payload.website) {
      return res.status(202).json({ message: "Request accepted." });
    }

    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const fromEmail = process.env.FROM_EMAIL;
    const hasResend = Boolean(process.env.EMAIL_API_KEY);
    const hasGmailSmtp = Boolean(
      process.env.SMTP_USER && process.env.SMTP_PASS,
    );

    if (!fromEmail || (!hasResend && !hasGmailSmtp)) {
      return res
        .status(500)
        .json({ message: "Server email configuration is missing." });
    }

    const adminSubject = `New Appointment Booking - ${payload.firstName} ${payload.lastName}`;
    const patientSubject =
      "Appointment Request Received | Toothbuds Dental Clinic";

    const adminHtml = buildAdminEmailHtml(payload);
    const patientHtml = buildPatientEmailHtml(payload);

    await Promise.all([
      sendEmail({
        from: fromEmail,
        to: ADMIN_EMAILS,
        subject: adminSubject,
        html: adminHtml,
      }),
      sendEmail({
        from: fromEmail,
        to: payload.email,
        subject: patientSubject,
        html: patientHtml,
      }),
      storeOptionalWebhook(payload),
    ]);

    return res
      .status(200)
      .json({ message: "Appointment booked successfully." });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to process booking right now. Please try again later.",
    });
  }
};

function setCorsHeaders(req, res) {
  const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const requestOrigin = req.headers.origin || "";

  if (allowedOrigins.length === 0 && requestOrigin) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  } else if (allowedOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_error) {
      return {};
    }
  }
  if (typeof body === "object") {
    return body;
  }
  return {};
}

function validatePayload(payload) {
  const required = [
    "firstName",
    "lastName",
    "email",
    "mobile",
    "age",
    "gender",
    "serviceType",
    "problemDescription",
    "visitDate",
    "timeSlot",
  ];

  for (const key of required) {
    if (!String(payload[key] || "").trim()) {
      return "Missing required fields.";
    }
  }

  if (!payload.consent) {
    return "Consent is required.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email))) {
    return "Invalid email address.";
  }

  if (!/^[0-9+\-\s]{10,15}$/.test(String(payload.mobile))) {
    return "Invalid mobile number.";
  }

  const ageNum = Number(payload.age);
  if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
    return "Invalid age.";
  }

  if (String(payload.problemDescription).length > 700) {
    return "Problem description is too long.";
  }

  return "";
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const current = memoryRateLimit.get(ip) || [];
  const filtered = current.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  filtered.push(now);
  memoryRateLimit.set(ip, filtered);
  return filtered.length > RATE_LIMIT_MAX_REQUESTS;
}

function buildAdminEmailHtml(data) {
  return `
    <h2>New Appointment Request</h2>
    <p><strong>Name:</strong> ${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}</p>
    <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
    <p><strong>Mobile:</strong> ${escapeHtml(data.mobile)}</p>
    <p><strong>Age:</strong> ${escapeHtml(String(data.age))}</p>
    <p><strong>Gender:</strong> ${escapeHtml(data.gender)}</p>
    <p><strong>Service:</strong> ${escapeHtml(data.serviceType)}</p>
    <p><strong>Date:</strong> ${escapeHtml(data.visitDate)}</p>
    <p><strong>Time Slot:</strong> ${escapeHtml(data.timeSlot)}</p>
    <p><strong>Problem Description:</strong><br/>${escapeHtml(data.problemDescription)}</p>
  `;
}

function buildPatientEmailHtml(data) {
  return `
    <h2>Toothbuds Kids & Family Dental Clinic</h2>
    <p>Dear ${escapeHtml(data.firstName)},</p>
    <p>Thank you for booking an appointment with us. We have received your request.</p>
    <p><strong>Requested Visit:</strong> ${escapeHtml(data.visitDate)} | ${escapeHtml(data.timeSlot)}</p>
    <p><strong>Service:</strong> ${escapeHtml(data.serviceType)}</p>
    <p>Our team will contact you shortly to confirm your appointment.</p>
    <p>Phone: +91-9498098000</p>
    <p>Address: First Floor, No 2, 160 Mount Poonamallee Rd, Landmark: beside Fashor, Saminathan Nagar, Kattupakkam, Chennai, Tamil Nadu 600056</p>
    <p>Regards,<br/>Toothbuds Team</p>
  `;
}

async function storeOptionalWebhook(payload) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function escapeHtml(input) {
  const str = String(input || "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail({ from, to, subject, html }) {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const smtpRecipients = Array.isArray(to) ? to.join(",") : to;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    return transporter.sendMail({
      from,
      to: smtpRecipients,
      subject,
      html,
    });
  }

  if (process.env.EMAIL_API_KEY) {
    const resend = new Resend(process.env.EMAIL_API_KEY);
    return resend.emails.send({
      from,
      to,
      subject,
      html,
    });
  }

  throw new Error("No email provider configured.");
}

import nodemailer from 'nodemailer';

let transporter;

function smtpConfig() {
  if (!process.env.SMTP_HOST) return null;
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined
  };
}

export async function sendMail({ to, subject, text, html }) {
  const cfg = smtpConfig();
  if (!cfg) throw new Error('SMTP is not configured');
  transporter ||= nodemailer.createTransport(cfg);
  return transporter.sendMail({
    from: process.env.SMTP_FROM || 'KARVEN <no-reply@karven.local>',
    to, subject, text, html
  });
}

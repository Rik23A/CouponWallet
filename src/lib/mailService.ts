// CouponVault Server — Mailer Service
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? '"CouponVault" <noreply@couponvault.com>';

function isSmtpConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

// Helper to log the email in a beautiful ASCII container
function logEmailToConsole(to: string, subject: string, otp: string, type: 'Verification' | 'Password Reset') {
  const line = '━'.repeat(60);
  console.log(`\n\x1b[35m┌${line}┐`);
  console.log(`│ \x1b[36m\x1b[1mCOUPONVAULT DEV EMAIL SERVER Fallback\x1b[0m\x1b[35m${' '.repeat(22)}│`);
  console.log(`├${line}┤`);
  console.log(`│ \x1b[1mTo:\x1b[0m       %-46s │`, to);
  console.log(`│ \x1b[1mSubject:\x1b[0m  %-46s │`, subject);
  console.log(`│ \x1b[1mType:\x1b[0m     %-46s │`, type);
  console.log(`│ \x1b[1mOTP Code:\x1b[0m \x1b[32m\x1b[1m%-46s\x1b[0m\x1b[35m │`, otp);
  console.log(`│                                                            │`);
  console.log(`│ \x1b[33m* Tip: Copy this OTP code and paste it into the mobile app. \x1b[35m│`);
  console.log(`└${line}┘\x1b[0m\n`);
}

// Premium HTML Template Generator
function getHtmlTemplate(title: string, message: string, code: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background-color: #f6f9fc;
            margin: 0;
            padding: 0;
            color: #333333;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          }
          .header {
            background-color: #6366f1;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
          .content {
            padding: 40px 30px;
          }
          .content p {
            font-size: 16px;
            line-height: 1.6;
            color: #4a5568;
            margin-bottom: 24px;
          }
          .code-box {
            background-color: #f3f4f6;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 30px 0;
            border: 1px dashed #cbd5e1;
          }
          .code {
            font-size: 36px;
            font-weight: 800;
            letter-spacing: 6px;
            color: #4f46e5;
            font-family: monospace;
          }
          .footer {
            background-color: #f8fafc;
            padding: 24px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #f1f5f9;
          }
          .footer a {
            color: #6366f1;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>CouponVault</h1>
          </div>
          <div class="content">
            <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">${title}</h2>
            <p>${message}</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p style="font-size: 14px; color: #64748b; margin-bottom: 0;">
              This code will expire in 15 minutes. If you did not request this code, please ignore this email.
            </p>
          </div>
          <div class="footer">
            <p>Sent by CouponVault Security Systems</p>
            <p>&copy; 2026 CouponVault. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// ─── Dispatch Verification OTP ──────────────────────────────────────────────────
export async function sendVerificationOtp(email: string, otp: string): Promise<boolean> {
  const subject = 'Verify your CouponVault Account';
  const message = 'Thank you for choosing CouponVault! To complete your registration, please verify your email address by entering the 6-digit security code below in your mobile app:';
  
  logEmailToConsole(email, subject, otp, 'Verification');

  if (!isSmtpConfigured()) {
    return true; // fallback success
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from:    SMTP_FROM,
      to:      email,
      subject: subject,
      text:    `${message}\n\nYour Code: ${otp}\n\nThis code will expire in 15 minutes.`,
      html:    getHtmlTemplate('Email Verification Required', message, otp),
    });

    console.log(`[Mailer] Verification OTP sent successfully to ${email}`);
    return true;
  } catch (err) {
    console.error(`[Mailer] Failed to send verification OTP to ${email}:`, err);
    return false;
  }
}

// ─── Dispatch Password Reset OTP ────────────────────────────────────────────────
export async function sendPasswordResetOtp(email: string, otp: string): Promise<boolean> {
  const subject = 'Reset your CouponVault Password';
  const message = 'We received a request to reset your CouponVault account password. To create a new password, please enter the 6-digit security reset code below in your mobile app:';

  logEmailToConsole(email, subject, otp, 'Password Reset');

  if (!isSmtpConfigured()) {
    return true; // fallback success
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from:    SMTP_FROM,
      to:      email,
      subject: subject,
      text:    `${message}\n\nYour Reset Code: ${otp}\n\nThis code will expire in 15 minutes.`,
      html:    getHtmlTemplate('Password Reset Request', message, otp),
    });

    console.log(`[Mailer] Reset OTP sent successfully to ${email}`);
    return true;
  } catch (err) {
    console.error(`[Mailer] Failed to send reset OTP to ${email}:`, err);
    return false;
  }
}

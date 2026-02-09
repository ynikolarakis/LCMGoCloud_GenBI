"""Email service for password reset emails."""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config import get_settings

logger = logging.getLogger(__name__)


class EmailService:
    """Service for sending emails (password reset, etc.)."""

    def __init__(self):
        self._settings = get_settings()

    async def send_password_reset_email(
        self,
        to_email: str,
        reset_token: str,
        display_name: str | None = None,
    ) -> bool:
        """Send a password reset email.

        Returns:
            True if sent successfully, False otherwise
        """
        provider = self._settings.email_provider.lower() if self._settings.email_provider else ""

        if not provider:
            # Email disabled - log token for development
            reset_url = self._build_reset_url(reset_token)
            logger.info(
                "EMAIL DISABLED - Password reset link for %s: %s",
                to_email,
                reset_url,
            )
            return True

        if provider == "ses":
            return await self._send_via_ses(to_email, reset_token, display_name)
        elif provider == "smtp":
            return await self._send_via_smtp(to_email, reset_token, display_name)
        else:
            logger.warning("Unknown email provider: %s", provider)
            return False

    def _build_reset_url(self, reset_token: str) -> str:
        """Build the password reset URL."""
        base_url = self._settings.app_base_url.rstrip("/")
        return f"{base_url}/reset-password?token={reset_token}"

    def _build_email_content(
        self,
        reset_token: str,
        display_name: str | None = None,
    ) -> tuple[str, str]:
        """Build email subject and HTML body."""
        reset_url = self._build_reset_url(reset_token)
        name = display_name or "User"

        subject = "GenBI Platform - Password Reset Request"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }}
        .content {{ padding: 30px 0; }}
        .button {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
        .footer {{ text-align: center; padding: 20px 0; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
        .warning {{ background-color: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 6px; margin: 20px 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; color: #1e40af;">GenBI Platform</h1>
        </div>
        <div class="content">
            <p>Hello {name},</p>
            <p>We received a request to reset your password for your GenBI Platform account.</p>
            <p>Click the button below to reset your password:</p>
            <p style="text-align: center;">
                <a href="{reset_url}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background-color: #f3f4f6; padding: 10px; border-radius: 4px;">
                {reset_url}
            </p>
            <div class="warning">
                <strong>Important:</strong> This link will expire in 24 hours. If you didn't request this password reset, you can safely ignore this email.
            </div>
        </div>
        <div class="footer">
            <p>This email was sent by GenBI Platform.<br>
            Powered by LCM Go Cloud.</p>
        </div>
    </div>
</body>
</html>
"""

        return subject, html_body

    async def _send_via_ses(
        self,
        to_email: str,
        reset_token: str,
        display_name: str | None = None,
    ) -> bool:
        """Send email via AWS SES."""
        try:
            import boto3

            client = boto3.client("ses", region_name=self._settings.aws_region)
            subject, html_body = self._build_email_content(reset_token, display_name)

            response = client.send_email(
                Source=self._settings.email_from_address,
                Destination={"ToAddresses": [to_email]},
                Message={
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}},
                },
            )

            logger.info(
                "Sent password reset email via SES to %s (MessageId: %s)",
                to_email,
                response.get("MessageId"),
            )
            return True

        except Exception as e:
            logger.error("Failed to send email via SES: %s", e)
            return False

    async def _send_via_smtp(
        self,
        to_email: str,
        reset_token: str,
        display_name: str | None = None,
    ) -> bool:
        """Send email via SMTP."""
        try:
            subject, html_body = self._build_email_content(reset_token, display_name)

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self._settings.email_from_address
            msg["To"] = to_email

            # Attach HTML part
            html_part = MIMEText(html_body, "html")
            msg.attach(html_part)

            # Connect to SMTP server
            if self._settings.smtp_use_tls:
                server = smtplib.SMTP(
                    self._settings.smtp_host,
                    self._settings.smtp_port,
                )
                server.starttls()
            else:
                server = smtplib.SMTP(
                    self._settings.smtp_host,
                    self._settings.smtp_port,
                )

            # Login if credentials provided
            if self._settings.smtp_username and self._settings.smtp_password:
                server.login(
                    self._settings.smtp_username,
                    self._settings.smtp_password,
                )

            server.sendmail(
                self._settings.email_from_address,
                [to_email],
                msg.as_string(),
            )
            server.quit()

            logger.info("Sent password reset email via SMTP to %s", to_email)
            return True

        except Exception as e:
            logger.error("Failed to send email via SMTP: %s", e)
            return False

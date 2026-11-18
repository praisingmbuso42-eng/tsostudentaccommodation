# TSO Student Housing — Email notification setup

Email delivery is optional until SMTP credentials are configured. The student portal and its in-portal notification history continue working when email is not configured or when an email provider is temporarily unavailable.

## Install the email dependency

From the project folder, run:

```bash
npm install
```

If npm reports that the lockfile needs updating, `npm install` will refresh `package-lock.json` using the dependency declared in `package.json`.

## SMTP settings for final setup

Add these values to your local `.env` file only during final configuration:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
```

- `SMTP_HOST`: SMTP server hostname supplied by your email provider.
- `SMTP_PORT`: usually 587 for STARTTLS or 465 for implicit TLS.
- `SMTP_SECURE`: set to `true` for port 465; otherwise use `false`.
- `SMTP_USER` and `SMTP_PASS`: SMTP login credentials or an app password.
- `EMAIL_FROM`: optional sender address; defaults to `SMTP_USER`.

Do not commit `.env` or share SMTP passwords. Use provider-generated app credentials where available.

## Notification events

The email service is called after the in-portal notification is inserted:
- Application submitted and application status changed.
- Document review status changed.
- Accommodation space allocated.
- Admin announcement sent to all registered students.

The email sender catches its own errors. A failed email does not undo or block the in-portal notification.

## Admin announcements

Administrators can open **Administration dashboard → Student announcements**. Each announcement is saved as an in-portal notification for every registered student, and email delivery is attempted when SMTP is configured.

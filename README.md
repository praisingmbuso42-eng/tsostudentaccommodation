# TSO Student Housing — 2027

A Node.js/Express + SQLite student accommodation website and management portal for TSO Student Housing.

## Requirements

- Node.js 22 or newer
- npm
- A persistent writable disk for the SQLite database and uploaded files

## First-time setup

1. Extract the project folder and open it in VS Code or a terminal.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set a unique `SESSION_SECRET` (at least 32 random characters).
5. Set `ADMIN_EMAIL` and a strong, unique `ADMIN_PASSWORD` before the first startup if the database does not already contain an administrator account.
6. Start the server with `npm start` (or `npm run dev` for local development).
7. Open `http://localhost:3000`.

Use the Express address above. Do not use VS Code Live Server on port 5500: the website and its session cookie must use the same Express origin.

The initial administrator is created only when both `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and no administrator with that email exists. Changing those environment variables later does not reset an existing administrator password. Keep `.env` private and never upload it to a public repository or send it with a project archive.

## Included functionality

- Public Home, About, Facilities, Gallery and Contact pages.
- Student registration, login and a persistent seven-day session.
- Student applications and application-status tracking.
- Five required PDF uploads: South African ID, VUT registration, proof of funding, proof of residence and academic transcript.
- Administrator application review, document verification and student records.
- Approval checks requiring all five documents to be verified; approved applications are capped at 50.
- Allocation of 50 numbered accommodation spaces to approved students, with reserve, occupy and release actions.
- In-portal student notifications for application, document, room and announcement updates.
- Optional email notifications when SMTP is configured.
- Student reviews with administrator moderation.
- Administrator reports and analytics.
- Administrator editing of public website wording, contact details, announcements and site images.
- Administrator login rate limiting: five failed attempts per IP in a 15-minute window; successful logins do not use the failed-attempt allowance.

## Existing records in this project archive

This working archive preserves the existing SQLite database, private student PDF uploads and public site images. It intentionally excludes `.env` and `node_modules`.

Treat this archive and all backups as confidential because the database and private uploads may contain personal student information. Do not publish the archive, place it in a public web directory, or share it through an unsecured channel. Keep a separate secure copy before replacing an existing project folder.

When deploying, keep these paths on persistent storage:

- `database/tso.sqlite`
- `server/uploads/` (private student documents; never expose this directory as static content)
- `public/uploads/site/` (public website images)

The application serves the public website from `public/`; private PDFs remain under `server/uploads/` and are delivered only through the authenticated administrator document route.

## Environment configuration

Copy `.env.example` to `.env` and configure:

- `NODE_ENV=production` on the live server.
- `PORT` to the port supplied by the hosting provider, if applicable.
- `SESSION_SECRET` to a unique random secret of at least 32 characters. Production startup is blocked if it is missing, too short or still looks like a placeholder.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` only for first administrator creation when no matching admin account exists.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and optionally `EMAIL_FROM` for email notifications.

In-portal notifications do not depend on SMTP. If SMTP is not configured or email delivery fails, students can still see notifications in their dashboards.

## Backups

Run `npm run backup` to create a timestamped backup under `backups/`. It includes a consistent SQLite database backup, private student uploads and public site images. Backups contain personal information: restrict access, encrypt them at rest where possible, and store an additional copy in a secure location separate from the application server.

Before a major update, stop the application or create a backup, then verify that the backup folder contains `tso.sqlite`, `server/uploads/` and `public/uploads/site/`. Periodically test restoring a backup to a separate test copy; a backup that has never been restored is not yet proven.

## Production deployment requirements — do not skip

This project has been prepared for deployment, but a live public launch still depends on the hosting provider and TSO's operational decisions. Before accepting real applications and identity, funding or academic documents:

1. Deploy behind HTTPS with a valid domain and configure the host's reverse proxy correctly.
2. Use a persistent disk for the database and uploads. Do not run multiple application replicas: this build uses a local SQLite session store and the default in-memory rate-limit store, which are designed for a single application instance.
3. Configure a strong production `SESSION_SECRET`, administrator credentials and SMTP settings.
4. Create, approve and publish a POPIA-compliant privacy notice explaining the data collected, purposes, access, retention, security safeguards and how students can exercise their rights. Have TSO management obtain appropriate legal/privacy review; this software does not itself establish legal compliance.
5. Decide who may access student records and private documents, and restrict administrator accounts and hosting access accordingly.
6. Set a documented retention/deletion process for student documents and backups.
7. Test the complete student and administrator journeys on the actual hosting environment, including email delivery and backup restoration.

VUT eligibility is declared by applicants and supported by uploaded proof of registration. This application does not connect to VUT systems to independently validate student status. TSO management must verify the evidence.

## Pre-launch test checklist

- [ ] Public pages, navigation, gallery and contact details display correctly.
- [ ] A new student can register, sign in, sign out and sign in again.
- [ ] A student can submit an application and track its status.
- [ ] All five valid PDFs upload; non-PDF and oversized files are rejected.
- [ ] A student cannot view another student's private documents.
- [ ] An administrator can review documents and verify/reject each one.
- [ ] An application cannot be approved until all five documents are verified.
- [ ] The system prevents more than 50 approved applications and more than 50 active space allocations.
- [ ] Only approved students can be allocated spaces; duplicate allocations are rejected.
- [ ] Portal notifications appear; email notifications arrive when SMTP is configured.
- [ ] Administrator login rejects incorrect credentials generically and rate-limits repeated failures.
- [ ] Administrator reports, reviews, announcements and website content editing work.
- [ ] A backup is created and restored successfully in a separate test environment.
- [ ] HTTPS, privacy notice, access controls and retention process are in place before public launch.

## Maintenance commands

- `npm start` — run the application.
- `npm run dev` — run locally with nodemon.
- `npm run check` — run JavaScript syntax checks.
- `npm run backup` — back up the database and uploaded files.

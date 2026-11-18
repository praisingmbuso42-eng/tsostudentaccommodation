# TSO Student Housing — launch preparation report

## Code preparation completed

- Administrator login rate limiting: five failed attempts per IP in 15 minutes; successful sign-ins are excluded from the failed-attempt count.
- Production startup now requires a strong session secret (at least 32 characters and not a placeholder).
- Added `.env.example` without credentials or secret values.
- Added a backup command (`npm run backup`) that backs up SQLite and both upload locations.
- Document uploads are validated before database writes and saved as one transaction; failed uploads are cleaned up.
- Added graceful shutdown and SQLite WAL checkpointing.
- Added Node.js 22+ engine requirement and syntax-check command.
- Updated setup, backup, deployment and operational instructions.

## Verification performed

- `npm run check` passed for the server, email module, browser scripts and backup script.
- Runtime health endpoint returned HTTP 200.
- Public pages returned HTTP 200.
- Student registration, authenticated student session, application submission and five-PDF upload passed on an isolated test copy.
- Invalid PDF upload returned HTTP 400 and did not leave extra uploaded files or partial document records.
- Private PDF direct URL returned HTTP 404.
- Administrator failed-login sequence returned five HTTP 401 responses followed by HTTP 429.
- Production startup without a valid `SESSION_SECRET` was blocked.
- Backup command created a database backup and copied private PDFs and public site images.
- Preserved project database passed SQLite integrity check after checkpointed packaging.

## Still required before public launch

This archive is launch-prepared, not a live hosted service. TSO must still:

1. Choose and configure the production host, domain and HTTPS certificate.
2. Configure `.env` on the server with a unique production session secret, administrator credentials as needed, and SMTP details.
3. Ensure the host provides persistent writable storage and run a single application instance (SQLite sessions and the default rate-limit store are local to one instance).
4. Approve and publish a POPIA-compliant privacy notice and define data-retention/deletion responsibilities.
5. Restrict access to administrator accounts, student records, backups and private documents.
6. Test the complete workflows, email delivery and backup restoration on the actual host before inviting applicants.

VUT student status is not automatically verified against VUT systems; management must review uploaded proof of registration.

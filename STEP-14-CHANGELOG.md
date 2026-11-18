# Step 14 – Administrator login rate limiting

- Added a dedicated rate limit to `POST /api/admin/login`.
- Allows up to 5 unsuccessful administrator login attempts per IP address in a rolling 15-minute window.
- Successful administrator logins do not consume the failed-attempt allowance.
- Requests over the limit receive HTTP 429 with a generic retry message.
- Student authentication and all other administrator routes are unchanged.

The existing `express-rate-limit` dependency is reused; no new package is required.

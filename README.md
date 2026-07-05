# Atnasya Health Tracker — Backend

Atnasya is a private, ad-free women’s health companion.  
This backend powers cycle tracking, wellness logging, partner support, insights, reminders, self-care content, AI guidance, and communications.

This service is offered free of charge, with the goal of keeping health data private and accessible.

## Tech Stack

- Node.js + Express
- MongoDB / Mongoose
- Firebase Admin
- TypeScript
- Zod request validation
- node-cron
- express-rate-limit / helmet / cors / morgan

## Project Structure

```
src/
  index.ts
  types.ts
  firebaseAdmin.ts
  express.d.ts
  node-cron.d.ts
  middleware/
    auth.ts
    validation.ts
  models/
    User.ts
    Cycle.ts
    Mood.ts
    Vital.ts
    Symptom.md
    Insight.ts
    Selfcare.ts
    ChatMessage.ts
    PartnerMessage.ts
    PartnerConnection.ts
  routes/
    auth.ts
    cycles.ts
    moods.ts
    vitals.ts
    symptoms.ts
    insights.ts
    selfcare.ts
    secret.ts
    ai.ts
    partner.ts
  services/
    index.ts
    cycleService.ts
    aiService.ts
    insightCron.ts
    partnerService.ts
  tests/
    cyclePredict.test.ts
    auth.test.ts
    ai.test.ts
```

## Cybersecurity & Privacy Notes

- **Secrets never go in the repo.**
  - `.env` is ignored by version control.
  - `.env.example` is intentionally incomplete.
  - If real credentials appear in git history, treat them as compromised and rotate them immediately.

- **Auth is enforced on protected routes.**
  - Protected endpoints verify Firebase ID tokens.
  - Unauthenticated requests to protected data return `401 Unauthorized`.
  - Routes with sensitive outputs/state changes require valid Bearer tokens unless explicitly noted.

- **AI config is not cross-contaminated on purpose.**
  - Gemini only reads `GEMINI_API_KEY` and `GEMINI_BASE_URL`.
  - OpenRouter is only used as an explicit fallback after Gemini fails for the same request.
  - Cross-provider key/URL fallback is intentionally disallowed to prevent silent auth failures.

- **CORS behavior.**
  - Production only allows the deployed Netlify origin.
  - Development allows localhost origins; broad dev patterns are never enabled in production.
  - Credentials mode is enabled; requests must include proper auth headers.

- **Validation & rate limiting.**
  - Request bodies are validated with Zod schemas.
  - Express rate-limiting and security headers are enabled at the server level.
  - Route handlers avoid echoing secrets or raw error stacks in production responses.

## Configuration

Create a `.env` file in the backend root before running the server.  
`.env` is ignored by version control; use `.env.example` as a template.

Key environment settings:
- Server port and runtime mode
- MongoDB connection string
- Firebase Admin credentials
- AI provider API keys and endpoints
- Dev bypass token value
- External cron secret

If a value is missing in `.env`, the server reads the fallback from `.env.example`.

## Scripts

- `npm run dev` — start with ts-node/nodemon
- `npm run build` — compile TypeScript
- `npm run start` — run compiled server
- `npm run test` — run backend tests
- `npm run setup-db` — database setup helper

## Notes

- Keep real credentials out of commits. Use `.env` locally and hosting secrets in production.
- The backend does not expose config dumps or stack details publicly in production.
- Services are split into business logic (`services/`), data models (`models/`), route handlers (`routes/`), and shared middleware (`middleware/`).

## Recent Changes

- AI history route now returns paginated data with Zod validation
- AI chat persists messages per-user under `scope: "ai"`
- Gemini/OpenRouter fallback hardened; no cross-provider key substitution
- CORS callback hardened so disallowed origins return `false` instead of `500`
- Partner prediction field added for frontend calendar colorization
- Protected route gating consistent across API routes

## Want to contribute?

Open an issue or PR in the matching repo.  
This project is maintained by Robel Biruk and built with care for Atnasya❤️

# MeetFlow AI MVP

MeetFlow AI converts meeting transcripts or recordings into structured action items, decisions, open questions, summaries, and a meeting score.

## Stack

- Client: React 18, TypeScript, Vite, Tailwind CSS, Framer Motion
- Server: Node 20, Express, TypeScript
- Data/Auth/Storage: Firebase Auth, Firestore, Firebase Storage
- AI: Gemini API with configurable model, default `gemini-flash-latest`

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env` files:

Copy `.env.example` to `.env` in the repo root, `client/.env`, and `server/.env` as needed. The client only needs the `VITE_FIREBASE_*` values plus `VITE_API_URL`. The server needs `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, optional `FIREBASE_STORAGE_BUCKET`, `GEMINI_API_KEY`, `CLIENT_URL`, and `PORT`.

3. Firebase:

- Create a Firebase project.
- Enable Firebase Authentication with Email/Password and Google providers.
- Create a Firestore database.
- Create a Firebase Storage bucket.
- Generate a service account private key and add the project ID, client email, private key, and bucket name to `server/.env`.
- Optional: publish `firebase/firestore.rules` and `firebase/storage.rules` if you also access Firebase directly from clients.

4. Run locally:

```bash
pnpm run dev
```

Client: `http://localhost:5173`

Server: `http://localhost:8080`

## Production Readiness Checklist

- Add `localhost` and `127.0.0.1` to Firebase Auth authorized domains for local testing.
- Deploy the frontend to Vercel or Firebase Hosting.
- Deploy the backend to Render, Railway, Fly.io, or Cloud Run.
- Set all server environment variables securely in the hosting provider.
- Rotate any API keys that were shared during development.
- Keep Firebase Storage blank if you are staying on Spark; text transcripts still work.
- Publish `firebase/firestore.rules` before client-side Firestore access is introduced.

## Test The Real Flow

This creates a temporary Firebase user, uploads a transcript, verifies Gemini extraction, updates an action, creates a follow-up email draft, deletes the test meeting, and removes the test user.

```bash
node scripts/e2e-real-user.cjs
```

## MVP Notes

- Free plan enforcement is active in the backend: 5 meetings per user per calendar month.
- Pro is UI-gated as "Coming Soon"; waitlist emails are stored in Firestore.
- Upload rate limiting is active: 12 upload attempts per user per hour.
- Phase 2 integrations are intentionally not implemented in this MVP.

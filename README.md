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

## Vercel Full-Stack Deploy

Deploy from the repo root, not from `client`.

Recommended Vercel project settings:

- Framework Preset: Other
- Root Directory: `.`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter @meetflow/server run build && pnpm --filter @meetflow/client run build`
- Output Directory: `client/dist`

The root `vercel.json` serves the React app from `client/dist` and routes `/api/*` to the Express backend through `api/[...path].js`.

Vercel environment variables:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-latest
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_STORAGE_BUCKET=
CLIENT_URL=https://your-vercel-domain.vercel.app
ADMIN_EMAILS=your-admin@email.com
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_ADMIN_EMAILS=your-admin@email.com
```

Do not set `VITE_API_URL` on Vercel unless the backend is deployed somewhere else. When it is blank, the frontend calls the same deployed domain at `/api`.

## Production Readiness Checklist

- Add `localhost` and `127.0.0.1` to Firebase Auth authorized domains for local testing.
- Add your Vercel production and preview domains to Firebase Auth authorized domains.
- Deploy the full-stack app to Vercel from the repo root.
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
- Pro manual payment verification is active: users submit payment proof, admins approve, and the backend activates Pro.
- Upload rate limiting is active: 12 upload attempts per user per hour.
- Phase 2 integrations are intentionally not implemented in this MVP.

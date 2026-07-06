const fs = require('node:fs');
const path = require('node:path');

function readEnv(filePath) {
  const result = {};
  const text = fs.readFileSync(filePath, 'utf8');

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    value = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    result[key] = value;
  }

  return result;
}

function loadFirebaseAdmin() {
  try {
    return require('firebase-admin');
  } catch {
    return require(path.resolve('server/node_modules/firebase-admin'));
  }
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function createFirebaseToken(email) {
  const clientEnv = readEnv('client/.env');
  const serverEnv = readEnv('server/.env');
  const admin = loadFirebaseAdmin();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serverEnv.FIREBASE_PROJECT_ID,
        clientEmail: serverEnv.FIREBASE_CLIENT_EMAIL,
        privateKey: serverEnv.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  }

  const user = await admin.auth().createUser({ email, emailVerified: true });
  const customToken = await admin.auth().createCustomToken(user.uid);
  const session = await jsonFetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${clientEnv.VITE_FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );

  if (!session.idToken) {
    throw new Error('Firebase did not return an ID token for the test user.');
  }

  return { admin, uid: user.uid, token: session.idToken };
}

async function main() {
  const clientEnv = readEnv('client/.env');
  const apiUrl = clientEnv.VITE_API_URL || 'http://localhost:8080';
  const email = `meetflow.e2e.${Date.now()}@example.com`;

  const health = await jsonFetch(`${apiUrl}/api/health`);
  console.log('health', health.ok === true && health.db === 'firebase' ? 'ok' : 'unexpected');

  const { admin, uid, token } = await createFirebaseToken(email);
  console.log('auth', 'ok');

  let meetingId;
  try {
    const usageBefore = await jsonFetch(`${apiUrl}/api/usage`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('usage-before', `${usageBefore.used}/${usageBefore.limit}`);

    const form = new FormData();
    form.set('title', 'E2E Customer Handoff Sync');
    form.set('participants', 'Maaz, Ayesha, Omar');
    form.set('transcript', [
      'Maaz: We decided to launch the customer onboarding pilot next Monday.',
      'Ayesha: I will prepare the onboarding checklist by Friday and share it with the team.',
      'Omar: I can draft the follow-up email tomorrow.',
      'Maaz: The pricing page must be reviewed before launch.',
      'Ayesha: Who will confirm whether Slack reminders are included?'
    ].join('\n'));

    const upload = await jsonFetch(`${apiUrl}/api/meetings/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    meetingId = upload.id;
    console.log('upload', upload.status === 'completed' && meetingId ? 'ok' : 'unexpected');

    const detail = await jsonFetch(`${apiUrl}/api/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('detail', {
      actions: detail.action_items?.length || 0,
      decisions: detail.decisions?.length || 0,
      questions: detail.open_questions?.length || 0,
      score: detail.meeting_score
    });

    if (!detail.action_items?.length) {
      throw new Error('Gemini extraction returned no action items.');
    }

    const firstAction = detail.action_items[0];
    const updated = await jsonFetch(`${apiUrl}/api/actions/${firstAction.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'in_progress', priority: 'high' })
    });
    console.log('action-update', updated.status === 'in_progress' ? 'ok' : 'unexpected');

    const draft = await jsonFetch(`${apiUrl}/api/meetings/${meetingId}/email-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('email-draft', draft.subject && draft.body ? 'ok' : 'missing');

    const paymentForm = new FormData();
    paymentForm.set('plan', 'pro');
    paymentForm.set('billing_cycle', 'monthly');
    paymentForm.set('payment_method', 'bank_transfer');
    paymentForm.set('amount', '3500');
    paymentForm.set('currency', 'PKR');
    paymentForm.set('sender_name', 'E2E Test Sender');
    paymentForm.set('sender_account', 'PK00TEST123');
    paymentForm.set('transaction_id', `E2E-${Date.now()}`);
    paymentForm.set('paid_at', new Date().toISOString().slice(0, 10));
    paymentForm.set('notes', 'Automated smoke test payment request.');
    const payment = await jsonFetch(`${apiUrl}/api/payment-requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: paymentForm
    });
    console.log('payment-request', payment.status === 'pending_verification' ? 'ok' : 'unexpected');

    const payments = await jsonFetch(`${apiUrl}/api/payment-requests`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('payment-list', payments.data?.length ? 'ok' : 'missing');

    await jsonFetch(`${apiUrl}/api/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('cleanup-meeting', 'ok');
  } finally {
    if (meetingId) {
      await fetch(`${apiUrl}/api/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => undefined);
    }

    const paymentSnapshot = await admin.firestore().collection('payment_requests').where('user_id', '==', uid).get().catch(() => undefined);
    if (paymentSnapshot && !paymentSnapshot.empty) {
      const batch = admin.firestore().batch();
      for (const doc of paymentSnapshot.docs) batch.delete(doc.ref);
      await batch.commit();
    }

    await admin.auth().deleteUser(uid).catch(() => undefined);
    console.log('cleanup-user', 'ok');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

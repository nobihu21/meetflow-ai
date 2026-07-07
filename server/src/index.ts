import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { requireAuth, type AuthedRequest } from './auth.js';
import { env } from './env.js';
import { bucket, db, Timestamp } from './firebase.js';
import { extractMeeting, generateFollowUpEmail, transcribeAudio } from './gemini.js';
import { paymentRequestSchema, updateActionSchema } from './schemas.js';

const app = express();
const uploadAttempts = new Map<string, { count: number; resetAt: number }>();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/x-m4a', 'text/plain'];
    cb(null, allowed.includes(file.mimetype) || /\.(mp3|m4a|webm|wav|txt)$/i.test(file.originalname));
  }
});
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype) || /\.(jpg|jpeg|png|webp|pdf)$/i.test(file.originalname));
  }
});

type FirestoreDoc = FirebaseFirestore.DocumentData & { id?: string };
type AsyncHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;
const adminEmails = new Set(env.ADMIN_EMAILS.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

const asyncHandler = (handler: AsyncHandler) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authedReq = req as AuthedRequest;
  const email = authedReq.user.email?.toLowerCase();

  if (!email || !adminEmails.has(email)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  return next();
}

async function getUserPlan(userId: string) {
  const userDoc = await db.collection('users').doc(userId).get();
  const plan = userDoc.data()?.plan;
  return plan === 'pro' ? 'pro' : 'free';
}

function serializeDoc<T extends FirestoreDoc>(snapshot: FirebaseFirestore.DocumentSnapshot): T {
  const data = snapshot.data() || {};
  const serialized = Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (value instanceof Timestamp) return [key, value.toDate().toISOString()];
      return [key, value];
    })
  );
  return { id: snapshot.id, ...serialized } as T;
}

function listFromSnapshot<T extends FirestoreDoc>(snapshot: FirebaseFirestore.QuerySnapshot): T[] {
  return snapshot.docs.map((doc) => serializeDoc<T>(doc));
}

async function getMeetingChildren(meetingId: string, userId: string) {
  const [actions, decisions, questions] = await Promise.all([
    db.collection('action_items').where('user_id', '==', userId).get(),
    db.collection('decisions').where('user_id', '==', userId).get(),
    db.collection('open_questions').where('user_id', '==', userId).get()
  ]);

  return {
    action_items: listFromSnapshot(actions).filter((item) => item.meeting_id === meetingId),
    decisions: listFromSnapshot(decisions).filter((item) => item.meeting_id === meetingId),
    open_questions: listFromSnapshot(questions).filter((item) => item.meeting_id === meetingId)
  };
}

async function processTranscriptForMeeting(meetingRef: FirebaseFirestore.DocumentReference, userId: string, transcript: string) {
  const extracted = await extractMeeting(transcript);
  const batch = db.batch();
  const now = Timestamp.now();

  batch.update(meetingRef, {
    summary: extracted.summary,
    raw_transcript: transcript,
    status: 'completed',
    meeting_score: extracted.meeting_score,
    error_message: null
  });

  for (const item of extracted.action_items) {
    const ref = db.collection('action_items').doc();
    batch.set(ref, {
      meeting_id: meetingRef.id,
      user_id: userId,
      description: item.description,
      owner_name: item.owner,
      due_date: item.due_date,
      priority: item.priority,
      status: 'pending',
      source_quote: item.source_quote,
      created_at: now
    });
  }

  for (const item of extracted.decisions) {
    const ref = db.collection('decisions').doc();
    batch.set(ref, {
      meeting_id: meetingRef.id,
      user_id: userId,
      description: item.description,
      made_by: item.made_by
    });
  }

  for (const item of extracted.open_questions) {
    const ref = db.collection('open_questions').doc();
    batch.set(ref, {
      meeting_id: meetingRef.id,
      user_id: userId,
      question: item.question,
      assigned_to: item.assigned_to
    });
  }

  await batch.commit();
}

app.use(helmet());
const allowedOrigins = new Set([
  env.CLIENT_URL,
  'http://localhost:5174',
  'http://127.0.0.1:5174'
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

app.use('/api/meetings/upload', requireAuth, (req, res, next) => {
  const authedReq = req as AuthedRequest;
  const now = Date.now();
  const existing = uploadAttempts.get(authedReq.user.id);
  const windowMs = 60 * 60 * 1000;
  const maxAttempts = 12;

  if (!existing || existing.resetAt <= now) {
    uploadAttempts.set(authedReq.user.id, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (existing.count >= maxAttempts) {
    return res.status(429).json({ error: 'Too many meeting uploads. Please try again later.' });
  }

  existing.count += 1;
  return next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, db: 'firebase' }));

app.get('/api/usage', requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const plan = await getUserPlan(authedReq.user.id);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const snapshot = await db.collection('meetings')
    .where('user_id', '==', authedReq.user.id)
    .get();
  const used = snapshot.docs.filter((doc) => {
    const createdAt = doc.data().created_at;
    return createdAt instanceof Timestamp && createdAt.toDate() >= monthStart;
  }).length;

  return res.json({
    plan,
    used,
    limit: plan === 'pro' ? 999999 : 5,
    remaining: plan === 'pro' ? 999999 : Math.max(0, 5 - used),
    reset_at: new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)).toISOString()
  });
}));

app.post('/api/meetings/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const title = String(req.body.title || '').trim();
  const transcriptInput = String(req.body.transcript || '').trim();
  const participants = String(req.body.participants || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!title) {
    return res.status(400).json({ error: 'Meeting title is required.' });
  }

  if (!transcriptInput && !req.file) {
    return res.status(400).json({ error: 'Paste a transcript or upload an audio/text file.' });
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const userMeetings = await db.collection('meetings')
    .where('user_id', '==', authedReq.user.id)
    .get();
  const plan = await getUserPlan(authedReq.user.id);
  const monthlyCount = userMeetings.docs.filter((doc) => {
    const createdAt = doc.data().created_at;
    return createdAt instanceof Timestamp && createdAt.toDate() >= monthStart;
  }).length;

  if (plan !== 'pro' && monthlyCount >= 5) {
    return res.status(402).json({ error: 'Free plan limit reached: 5 meetings this month.' });
  }

  const meetingRef = db.collection('meetings').doc();
  const now = Timestamp.now();

  await meetingRef.set({
    user_id: authedReq.user.id,
    title,
    meeting_date: now,
    participants,
    status: 'processing',
    meeting_score: null,
    created_at: now
  });

  try {
    let transcript = transcriptInput;
    let audioUrl: string | null = null;

    if (req.file) {
      if (req.file.mimetype === 'text/plain' || /\.txt$/i.test(req.file.originalname)) {
        transcript = req.file.buffer.toString('utf8');
      } else {
        if (bucket) {
          const storagePath = `meeting-audio/${authedReq.user.id}/${meetingRef.id}/${Date.now()}-${req.file.originalname}`;
          await bucket.file(storagePath).save(req.file.buffer, {
            contentType: req.file.mimetype,
            resumable: false,
            metadata: {
              metadata: {
                userId: authedReq.user.id,
                meetingId: meetingRef.id
              }
            }
          });

          audioUrl = `gs://${bucket.name}/${storagePath}`;
        }
        transcript = await transcribeAudio(req.file);
      }
    }

    await processTranscriptForMeeting(meetingRef, authedReq.user.id, transcript);
    if (audioUrl) await meetingRef.update({ audio_url: audioUrl });

    return res.status(201).json({ id: meetingRef.id, status: 'completed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed.';
    await meetingRef.update({
      status: 'failed',
      error_message: message
    });
    return res.status(500).json({ id: meetingRef.id, error: "Couldn't process this transcript, please try again." });
  }
}));

app.get('/api/meetings', requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
  const search = String(req.query.search || '').trim().toLowerCase();

  const snapshot = await db.collection('meetings')
    .where('user_id', '==', authedReq.user.id)
    .get();

  const allMeetings = listFromSnapshot(snapshot)
    .filter((meeting) => {
      if (!search) return true;
      return String(meeting.title || '').toLowerCase().includes(search);
    })
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const data = allMeetings.slice((page - 1) * limit, page * limit).map((meeting) => ({
    id: meeting.id,
    title: meeting.title,
    meeting_date: meeting.meeting_date,
    status: meeting.status,
    meeting_score: meeting.meeting_score ?? null,
    created_at: meeting.created_at,
    error_message: meeting.error_message ?? null
  }));

  return res.json({ data, count: allMeetings.length, page, limit });
}));

app.get('/api/meetings/:id', requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const meetingDoc = await db.collection('meetings').doc(req.params.id).get();

  if (!meetingDoc.exists) {
    return res.json({
      id: req.params.id,
      deleted: true,
      title: 'Meeting not found',
      meeting_date: null,
      status: 'failed',
      meeting_score: null,
      created_at: new Date().toISOString(),
      error_message: 'Meeting not found.',
      participants: [],
      summary: null,
      raw_transcript: null,
      action_items: [],
      decisions: [],
      open_questions: []
    });
  }

  const meeting = serializeDoc(meetingDoc);
  if (meeting.user_id !== authedReq.user.id) {
    return res.json({
      id: req.params.id,
      deleted: true,
      title: 'Meeting not found',
      meeting_date: null,
      status: 'failed',
      meeting_score: null,
      created_at: new Date().toISOString(),
      error_message: 'Meeting not found.',
      participants: [],
      summary: null,
      raw_transcript: null,
      action_items: [],
      decisions: [],
      open_questions: []
    });
  }

  const children = await getMeetingChildren(req.params.id, authedReq.user.id);

  return res.json({
    ...meeting,
    ...children
  });
}));

app.post('/api/meetings/:id/retry', requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const meetingRef = db.collection('meetings').doc(req.params.id);
  const meetingDoc = await meetingRef.get();

  if (!meetingDoc.exists || meetingDoc.data()?.user_id !== authedReq.user.id) {
    return res.status(404).json({ error: 'Meeting not found.' });
  }

  const transcript = String(meetingDoc.data()?.raw_transcript || '').trim();
  if (!transcript) {
    return res.status(400).json({ error: 'No transcript is available to retry.' });
  }

  const [actions, decisions, questions] = await Promise.all([
    db.collection('action_items').where('user_id', '==', authedReq.user.id).get(),
    db.collection('decisions').where('user_id', '==', authedReq.user.id).get(),
    db.collection('open_questions').where('user_id', '==', authedReq.user.id).get()
  ]);
  const batch = db.batch();
  for (const doc of [...actions.docs, ...decisions.docs, ...questions.docs]) {
    if (doc.data().meeting_id === req.params.id) batch.delete(doc.ref);
  }
  batch.update(meetingRef, { status: 'processing', error_message: null });
  await batch.commit();

  try {
    await processTranscriptForMeeting(meetingRef, authedReq.user.id, transcript);
    return res.json({ id: meetingRef.id, status: 'completed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed.';
    await meetingRef.update({ status: 'failed', error_message: message });
    return res.status(500).json({ error: "Couldn't process this transcript, please try again." });
  }
}));

app.post('/api/meetings/:id/email-draft', requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const meetingDoc = await db.collection('meetings').doc(req.params.id).get();

  if (!meetingDoc.exists || meetingDoc.data()?.user_id !== authedReq.user.id) {
    return res.status(404).json({ error: 'Meeting not found.' });
  }

  const meeting = serializeDoc(meetingDoc);
  const children = await getMeetingChildren(req.params.id, authedReq.user.id);
  const draft = await generateFollowUpEmail({
    title: String(meeting.title || 'Meeting'),
    summary: meeting.summary,
    actions: children.action_items.map((item) => ({
      description: String(item.description || ''),
      owner_name: typeof item.owner_name === 'string' ? item.owner_name : null,
      due_date: typeof item.due_date === 'string' ? item.due_date : null,
      priority: typeof item.priority === 'string' ? item.priority : null
    })),
    decisions: children.decisions.map((item) => ({
      description: String(item.description || ''),
      made_by: typeof item.made_by === 'string' ? item.made_by : null
    })),
    questions: children.open_questions.map((item) => ({
      question: String(item.question || ''),
      assigned_to: typeof item.assigned_to === 'string' ? item.assigned_to : null
    }))
  });

  return res.json(draft);
}));

app.put('/api/actions/:id', requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const payload = updateActionSchema.parse(req.body);
  const actionRef = db.collection('action_items').doc(req.params.id);
  const actionDoc = await actionRef.get();

  if (!actionDoc.exists || actionDoc.data()?.user_id !== authedReq.user.id) {
    return res.status(404).json({ error: 'Action item not found.' });
  }

  await actionRef.update(payload);
  const updated = await actionRef.get();

  return res.json(serializeDoc(updated));
}));

app.delete('/api/meetings/:id', requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const meetingRef = db.collection('meetings').doc(req.params.id);
  const meetingDoc = await meetingRef.get();

  if (!meetingDoc.exists || meetingDoc.data()?.user_id !== authedReq.user.id) {
    return res.status(204).send();
  }

  const [actions, decisions, questions] = await Promise.all([
    db.collection('action_items').where('user_id', '==', authedReq.user.id).get(),
    db.collection('decisions').where('user_id', '==', authedReq.user.id).get(),
    db.collection('open_questions').where('user_id', '==', authedReq.user.id).get()
  ]);

  const batch = db.batch();
  for (const doc of [...actions.docs, ...decisions.docs, ...questions.docs].filter((item) => item.data().meeting_id === req.params.id)) {
    batch.delete(doc.ref);
  }
  batch.delete(meetingRef);
  await batch.commit();

  return res.status(204).send();
}));

app.post('/api/waitlist', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email.' });
  }

  const id = Buffer.from(email).toString('base64url') || randomUUID();
  await db.collection('waitlist').doc(id).set({
    email,
    created_at: Timestamp.now()
  }, { merge: true });

  return res.status(201).json({ ok: true });
}));

app.get('/api/payment-requests', requireAuth, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const snapshot = await db.collection('payment_requests')
    .where('user_id', '==', authedReq.user.id)
    .get();
  const data = listFromSnapshot(snapshot)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  return res.json({ data });
}));

app.post('/api/payment-requests', requireAuth, proofUpload.single('proof'), asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const payload = paymentRequestSchema.parse(req.body);
  const normalizedTransactionId = payload.transaction_id.toLowerCase().replace(/\s+/g, '');
  const existing = await db.collection('payment_requests')
    .where('normalized_transaction_id', '==', normalizedTransactionId)
    .get();

  if (existing.docs.some((doc) => doc.data().status !== 'rejected')) {
    return res.status(409).json({ error: 'This transaction ID is already under review.' });
  }

  const paymentRef = db.collection('payment_requests').doc();
  let proofPath: string | null = null;
  let proofFileName: string | null = null;

  if (req.file) {
    proofFileName = req.file.originalname;
    if (bucket) {
      proofPath = `payment-proofs/${authedReq.user.id}/${paymentRef.id}/${Date.now()}-${req.file.originalname}`;
      await bucket.file(proofPath).save(req.file.buffer, {
        contentType: req.file.mimetype,
        resumable: false,
        metadata: {
          metadata: {
            userId: authedReq.user.id,
            paymentRequestId: paymentRef.id
          }
        }
      });
    }
  }

  await paymentRef.set({
    ...payload,
    user_id: authedReq.user.id,
    user_email: authedReq.user.email || null,
    normalized_transaction_id: normalizedTransactionId,
    status: 'pending_verification',
    proof_path: proofPath,
    proof_file_name: proofFileName,
    verification_note: null,
    created_at: Timestamp.now(),
    reviewed_at: null,
    reviewed_by: null
  });

  return res.status(201).json(serializeDoc(await paymentRef.get()));
}));

app.get('/api/admin/payment-requests', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const snapshot = await db.collection('payment_requests').get();
  const data = listFromSnapshot(snapshot)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  return res.json({ data });
}));

app.post('/api/admin/payment-requests/:id/approve', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const paymentRef = db.collection('payment_requests').doc(req.params.id);
  const paymentDoc = await paymentRef.get();

  if (!paymentDoc.exists) {
    return res.status(404).json({ error: 'Payment request not found.' });
  }

  const payment = paymentDoc.data() || {};
  if (payment.status === 'approved') {
    return res.json(serializeDoc(paymentDoc));
  }

  const userId = String(payment.user_id || '');
  if (!userId) {
    return res.status(400).json({ error: 'Payment request is missing user ownership.' });
  }

  const batch = db.batch();
  batch.update(paymentRef, {
    status: 'approved',
    verification_note: String(req.body?.note || 'Verified manually.').slice(0, 500),
    reviewed_at: Timestamp.now(),
    reviewed_by: authedReq.user.email || authedReq.user.id
  });
  batch.set(db.collection('users').doc(userId), {
    plan: 'pro',
    plan_source: 'manual_payment',
    plan_activated_at: Timestamp.now(),
    plan_expires_at: null,
    updated_at: Timestamp.now()
  }, { merge: true });
  await batch.commit();

  return res.json(serializeDoc(await paymentRef.get()));
}));

app.post('/api/admin/payment-requests/:id/reject', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const authedReq = req as AuthedRequest;
  const paymentRef = db.collection('payment_requests').doc(req.params.id);
  const paymentDoc = await paymentRef.get();

  if (!paymentDoc.exists) {
    return res.status(404).json({ error: 'Payment request not found.' });
  }

  await paymentRef.update({
    status: 'rejected',
    verification_note: String(req.body?.note || 'Could not verify payment.').slice(0, 500),
    reviewed_at: Timestamp.now(),
    reviewed_by: authedReq.user.email || authedReq.user.id
  });

  return res.json(serializeDoc(await paymentRef.get()));
}));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  console.error(error);
  return res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Server request failed. Check deployment logs.' : message
  });
});

if (!process.env.VERCEL) {
  app.listen(env.PORT, () => {
    console.log(`MeetFlow API running on http://localhost:${env.PORT} with Firebase`);
  });
}

export default app;

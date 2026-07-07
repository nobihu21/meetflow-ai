import admin from 'firebase-admin';
import { env } from './env.js';

const privateKey = env.FIREBASE_PRIVATE_KEY
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey
    }),
    storageBucket: env.FIREBASE_STORAGE_BUCKET
  });
}

export const firebaseAuth = admin.auth();
export const db = admin.firestore();
export const bucket = env.FIREBASE_STORAGE_BUCKET ? admin.storage().bucket() : null;
export const FieldValue = admin.firestore.FieldValue;
export const Timestamp = admin.firestore.Timestamp;

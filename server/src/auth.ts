import type { NextFunction, Request, Response } from 'express';
import { firebaseAuth } from './firebase.js';

export type AuthedRequest = Request & {
  user: {
    id: string;
    email?: string;
  };
};

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token.' });
  }

  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    (req as AuthedRequest).user = {
      id: decoded.uid,
      email: decoded.email
    };
  } catch {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  return next();
}

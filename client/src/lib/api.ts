import { auth } from './firebase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  if (!response.ok) throw new Error((await response.json()).error || 'Request failed.');
  return response.json() as Promise<T>;
}

export async function apiJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error((await response.json()).error || 'Request failed.');
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function uploadMeeting(form: FormData): Promise<{ id: string; status: string }> {
  const response = await fetch(`${API_URL}/api/meetings/upload`, {
    method: 'POST',
    headers: await authHeaders(),
    body: form
  });
  if (!response.ok) throw new Error((await response.json()).error || 'Upload failed.');
  return response.json() as Promise<{ id: string; status: string }>;
}

export async function uploadPaymentProof<T>(form: FormData): Promise<T> {
  const response = await fetch(`${API_URL}/api/payment-requests`, {
    method: 'POST',
    headers: await authHeaders(),
    body: form
  });
  if (!response.ok) throw new Error((await response.json()).error || 'Payment request failed.');
  return response.json() as Promise<T>;
}

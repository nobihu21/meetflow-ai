import { auth } from './firebase';

const API_URL = import.meta.env.VITE_API_URL || '';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseApiResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  let body: unknown = {};

  if (contentType.includes('application/json') && text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }

  if (!response.ok) {
    const apiError = body && typeof body === 'object' && 'error' in body ? String((body as { error?: unknown }).error) : '';
    const message = apiError || (response.status === 404 ? 'Meeting not found.' : fallbackMessage);
    throw new Error(message);
  }

  if (!text) return undefined as T;
  if (!contentType.includes('application/json')) return undefined as T;
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  return parseApiResponse<T>(response, 'Request failed.');
}

export async function apiJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined
  });
  return parseApiResponse<T>(response, 'Request failed.');
}

export async function uploadMeeting(form: FormData): Promise<{ id: string; status: string }> {
  const response = await fetch(`${API_URL}/api/meetings/upload`, {
    method: 'POST',
    headers: await authHeaders(),
    body: form
  });
  return parseApiResponse<{ id: string; status: string }>(response, 'Upload failed.');
}

export async function uploadPaymentProof<T>(form: FormData): Promise<T> {
  const response = await fetch(`${API_URL}/api/payment-requests`, {
    method: 'POST',
    headers: await authHeaders(),
    body: form
  });
  return parseApiResponse<T>(response, 'Payment request failed.');
}

import { env } from './env.js';
import { extractionSchema, type Extraction } from './schemas.js';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const extractionPrompt = (transcript: string) => `You are a meeting analyst AI. Analyze this meeting transcript and extract structured information. Return ONLY valid JSON, no explanation, no markdown code fences.

Format:
{
  "summary": "2-3 sentence meeting summary",
  "action_items": [
    {"description": "task", "owner": "name or Unknown", "due_date": "YYYY-MM-DD or null", "priority": "high|medium|low", "source_quote": "exact phrase from transcript"}
  ],
  "decisions": [
    {"description": "what was decided", "made_by": "name"}
  ],
  "open_questions": [
    {"question": "what was asked but not answered", "assigned_to": "name or null"}
  ],
  "meeting_score": 0-100
}

Scoring rule: 100 = clear decisions + all actions assigned + no open questions. Deduct points for vague ownership, missing deadlines, and unresolved questions.

Transcript:
${transcript}`;

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

async function generateContent(parts: Array<Record<string, unknown>>, responseMimeType = 'text/plain') {
  const response = await fetch(`${GEMINI_BASE_URL}/models/${env.GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json() as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini returned empty content.');
  }

  return text;
}

export async function transcribeAudio(file: Express.Multer.File): Promise<string> {
  return generateContent([
    { text: 'Transcribe this meeting audio accurately. Return only the transcript text, no summary and no markdown.' },
    {
      inlineData: {
        mimeType: file.mimetype,
        data: file.buffer.toString('base64')
      }
    }
  ]);
}

export async function extractMeeting(transcript: string): Promise<Extraction> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await generateContent([{ text: extractionPrompt(transcript) }], 'application/json');
      return extractionSchema.parse(JSON.parse(content));
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Meeting extraction failed.');
}

export async function generateFollowUpEmail(input: {
  title: string;
  summary?: string | null;
  actions: Array<{ description?: string; owner_name?: string | null; due_date?: string | null; priority?: string | null }>;
  decisions: Array<{ description?: string; made_by?: string | null }>;
  questions: Array<{ question?: string; assigned_to?: string | null }>;
}) {
  const text = await generateContent([{
    text: `Write a concise professional follow-up email for this meeting. Return only JSON with keys "subject" and "body". No markdown.

Meeting title: ${input.title}
Summary: ${input.summary || 'No summary available'}
Actions: ${JSON.stringify(input.actions)}
Decisions: ${JSON.stringify(input.decisions)}
Open questions: ${JSON.stringify(input.questions)}`
  }], 'application/json');

  const parsed = JSON.parse(text) as { subject?: unknown; body?: unknown };
  return {
    subject: typeof parsed.subject === 'string' && parsed.subject.trim() ? parsed.subject.trim() : `Follow-up: ${input.title}`,
    body: typeof parsed.body === 'string' && parsed.body.trim() ? parsed.body.trim() : ''
  };
}

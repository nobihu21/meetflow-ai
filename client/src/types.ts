export type Priority = 'high' | 'medium' | 'low';
export type ActionStatus = 'pending' | 'in_progress' | 'completed';

export type MeetingListItem = {
  id: string;
  title: string;
  meeting_date: string;
  status: 'processing' | 'completed' | 'failed';
  meeting_score: number | null;
  created_at: string;
  error_message?: string | null;
};

export type ActionItem = {
  id: string;
  meeting_id: string;
  description: string;
  owner_name: string | null;
  due_date: string | null;
  priority: Priority;
  status: ActionStatus;
  source_quote: string | null;
};

export type Decision = {
  id: string;
  description: string;
  made_by: string | null;
};

export type OpenQuestion = {
  id: string;
  question: string;
  assigned_to: string | null;
};

export type MeetingDetail = MeetingListItem & {
  participants: string[] | null;
  summary: string | null;
  raw_transcript: string | null;
  action_items: ActionItem[];
  decisions: Decision[];
  open_questions: OpenQuestion[];
};

export type Usage = {
  plan: 'free' | 'pro';
  used: number;
  limit: number;
  remaining: number;
  reset_at: string;
};

export type EmailDraft = {
  subject: string;
  body: string;
};

export type PaymentRequest = {
  id: string;
  user_id?: string;
  user_email?: string | null;
  plan: 'pro';
  billing_cycle: 'monthly' | 'yearly';
  payment_method: 'bank_transfer' | 'jazzcash' | 'easypaisa';
  amount: number;
  currency: 'PKR' | 'USD';
  sender_name: string;
  sender_account: string;
  transaction_id: string;
  paid_at: string;
  notes?: string;
  status: 'pending_verification' | 'approved' | 'rejected';
  proof_file_name: string | null;
  verification_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

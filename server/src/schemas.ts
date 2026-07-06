import { z } from 'zod';

export const prioritySchema = z.enum(['high', 'medium', 'low']);
export const actionStatusSchema = z.enum(['pending', 'in_progress', 'completed']);

export const extractionSchema = z.object({
  summary: z.string().min(1),
  action_items: z.array(z.object({
    description: z.string().min(1),
    owner: z.string().nullable().transform((value) => value || 'Unknown'),
    due_date: z.string().nullable(),
    priority: prioritySchema,
    source_quote: z.string().nullable().default('')
  })),
  decisions: z.array(z.object({
    description: z.string().min(1),
    made_by: z.string().nullable().default('Unknown')
  })),
  open_questions: z.array(z.object({
    question: z.string().min(1),
    assigned_to: z.string().nullable()
  })),
  meeting_score: z.number().int().min(0).max(100)
});

export type Extraction = z.infer<typeof extractionSchema>;

export const updateActionSchema = z.object({
  owner_name: z.string().max(200).nullable().optional(),
  due_date: z.string().nullable().optional(),
  priority: prioritySchema.optional(),
  status: actionStatusSchema.optional()
});

export const paymentRequestSchema = z.object({
  plan: z.enum(['pro']).default('pro'),
  billing_cycle: z.enum(['monthly', 'yearly']).default('monthly'),
  payment_method: z.enum(['bank_transfer', 'jazzcash', 'easypaisa']),
  amount: z.coerce.number().positive().max(1_000_000),
  currency: z.enum(['PKR', 'USD']).default('PKR'),
  sender_name: z.string().trim().min(2).max(120),
  sender_account: z.string().trim().min(3).max(120),
  transaction_id: z.string().trim().min(4).max(120),
  paid_at: z.string().trim().min(8).max(40),
  notes: z.string().trim().max(500).optional().default('')
});

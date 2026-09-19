import { z } from 'zod';

const email = z.string().trim().email().max(320);
const id = z.string().uuid();
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const metadata = z.record(z.any()).optional().default({});

export const registerSchema = z.object({
  email,
  password: z.string().min(10).max(200),
  fullName: z.string().trim().min(1).max(160),
  workspaceName: z.string().trim().min(1).max(160)
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
export const refreshSchema = z.object({ refreshToken: z.string().min(40).max(300) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(40).max(300), password: z.string().min(10).max(200) });

export const workspaceSchema = z.object({ name: z.string().trim().min(1).max(160) });
export const memberSchema = z.object({ email, role: z.enum(['admin','manager','member','viewer']) });

export const companySchema = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(255).optional().default(''),
  email: email.optional().nullable(),
  phone: z.string().trim().max(80).optional().default(''),
  website: z.string().trim().max(500).optional().default(''),
  ownerUserId: id.optional().nullable(),
  metadata
});

export const contactSchema = z.object({
  companyId: id.optional().nullable(),
  firstName: z.string().trim().max(120).optional().default(''),
  lastName: z.string().trim().max(120).optional().default(''),
  email: email.optional().nullable(),
  phone: z.string().trim().max(80).optional().default(''),
  jobTitle: z.string().trim().max(160).optional().default(''),
  ownerUserId: id.optional().nullable(),
  metadata
});

export const pipelineSchema = z.object({
  name: z.string().trim().min(1).max(160),
  isDefault: z.boolean().optional().default(false),
  stages: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    position: z.number().int().min(0).max(1000),
    probability: z.number().int().min(0).max(100)
  })).min(1).max(50)
});

export const opportunitySchema = z.object({
  title: z.string().trim().min(1).max(240),
  pipelineId: id.optional().nullable(),
  stageId: id.optional().nullable(),
  contactId: id.optional().nullable(),
  companyId: id.optional().nullable(),
  ownerUserId: id.optional().nullable(),
  amountCents: money.optional().default(0),
  currency: z.string().trim().length(3).transform(v => v.toUpperCase()).optional().default('USD'),
  probability: z.number().int().min(0).max(100).optional().default(0),
  expectedCloseDate: z.string().date().optional().nullable(),
  status: z.enum(['open','won','lost','archived']).optional().default('open'),
  metadata
});

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(10000).optional().default(''),
  status: z.enum(['todo','in_progress','done','cancelled']).optional().default('todo'),
  priority: z.enum(['low','normal','high','urgent']).optional().default('normal'),
  dueAt: z.string().datetime().optional().nullable(),
  assigneeUserId: id.optional().nullable(),
  linkedType: z.string().max(80).optional().nullable(),
  linkedId: id.optional().nullable()
});

export const noteSchema = z.object({
  body: z.string().trim().min(1).max(50000),
  linkedType: z.string().max(80).optional().nullable(),
  linkedId: id.optional().nullable()
});

export const webhookSchema = z.object({
  url: z.string().url().max(2000),
  events: z.array(z.string().min(1).max(160)).min(1).max(100),
  active: z.boolean().optional().default(true)
});

export const fileSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: money.max(1024 * 1024 * 1024)
});

export const planSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  priceCents: money,
  currency: z.string().trim().length(3).transform(v => v.toUpperCase()),
  interval: z.enum(['month','year','one_time']),
  features: z.record(z.any()).optional().default({}),
  active: z.boolean().optional().default(true)
});

import { z } from 'zod';

export const kinds = ['customer','team','content','navigation','legal','plan','discount','payment'];
export const statuses = ['active','paused','draft','published','pending','paid','failed','expired'];

export const recordSchema = z.object({
  kind: z.enum(kinds),
  title: z.string().trim().min(1).max(180),
  tag: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(8000).optional().default(''),
  status: z.enum(statuses).default('active'),
  metadata: z.record(z.any()).optional().default({})
});

export const settingsSchema = z.object({
  brandName: z.string().trim().min(1).max(120).default('KARVEN'),
  supportEmail: z.string().trim().email().optional().or(z.literal('')).default(''),
  announcement: z.string().trim().max(500).optional().default(''),
  maintenanceMode: z.boolean().default(false),
  registrationsEnabled: z.boolean().default(true),
  paymentsEnabled: z.boolean().default(true),
  defaultCurrency: z.string().trim().min(3).max(3).transform(v => v.toUpperCase()).default('USD')
});

import { z } from 'zod';
import { isAllowedEmail } from './email';

// Error messages are stable machine codes; the client maps them to copy.
export const EXPERIENCE_LEVELS = ['new', 'some', 'experienced'] as const;

export const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'invalid_email' }).max(254, { error: 'invalid_email' }))
    .refine(isAllowedEmail, { error: 'email_not_allowed' }),
  method: z.literal('email').default('email'),
  anonymous_id: z.string().max(64).nullable().default(null),
  time_to_submit_ms: z.number().int().min(0).nullable().default(null),
  // One flat entry per registered experiment (`null` when not enrolled).
  experiments: z.record(z.string().regex(/^[a-z0-9_]{1,64}$/), z.string().max(40).nullable()).default({}),
  // Honeypot: real users never see this field.
  website: z.string().max(200).optional(),
});

export const updateUserSchema = z
  .object({
    display_name: z.string().trim().min(1, { error: 'required' }).max(60, { error: 'too_long' }).optional(),
    experience_level: z.enum(EXPERIENCE_LEVELS, { error: 'invalid_choice' }).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { error: 'empty_update' });

export const listQuerySchema = z.object({
  limit: z.coerce.number({ error: 'invalid_number' }).int({ error: 'invalid_number' }).min(1, { error: 'out_of_range' }).max(100, { error: 'out_of_range' }).default(50),
  offset: z.coerce.number({ error: 'invalid_number' }).int({ error: 'invalid_number' }).min(0, { error: 'out_of_range' }).default(0),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export interface User {
  id: string;
  email: string;
  method: 'email';
  is_suspected_bot: boolean;
  created_at: string;
  updated_at: string;
  profile: { display_name: string | null; experience_level: (typeof EXPERIENCE_LEVELS)[number] | null };
}

export type ApiError = {
  error: { code: string; message: string; retryable: boolean; fields?: Record<string, string> };
};

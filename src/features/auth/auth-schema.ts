import { z } from 'zod'
import { MAX_EMAIL_LENGTH, isPlausibleEmail } from '@/lib/email'
import { isPasswordCompliant, MIN_PASSWORD_LENGTH } from './password-policy'

export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect'
export const DUPLICATE_EMAIL_MESSAGE = 'An account with this email already exists'
export const PASSWORD_POLICY_MESSAGE = `The password does not meet the policy of at least ${MIN_PASSWORD_LENGTH} characters, upper and lower case letters, and two special characters`
const EMAIL_TOO_LONG_MESSAGE = `Too big: expected string to have <=${MAX_EMAIL_LENGTH} characters`

export const authUserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string(),
  createdAt: z.string(),
})

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(MAX_EMAIL_LENGTH, EMAIL_TOO_LONG_MESSAGE)
  .refine(isPlausibleEmail, 'Enter a valid email address')

export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const registrationSchema = z.object({
  email: emailSchema,
  password: z.string().refine(isPasswordCompliant, PASSWORD_POLICY_MESSAGE),
})

export type AuthUser = z.infer<typeof authUserSchema>
export type Credentials = z.infer<typeof credentialsSchema>

import { z } from '@/lib/zod'
import { isPlausibleEmail } from '@/lib/email'
import { isPasswordCompliant, MIN_PASSWORD_LENGTH } from './password-policy'

export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect'
export const DUPLICATE_EMAIL_MESSAGE = 'An account with this email already exists'
export const PASSWORD_POLICY_MESSAGE = `The password does not meet the policy of at least ${MIN_PASSWORD_LENGTH} characters, upper and lower case letters, and two special characters`
export const TERMS_ACCEPTANCE_MESSAGE = 'You must accept the terms of service to create an account'
export const PRIVACY_ACCEPTANCE_MESSAGE = 'You must accept the privacy policy to create an account'

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
  .refine(isPlausibleEmail, 'Enter a valid email address')

export const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const registrationSchema = z.object({
  email: emailSchema,
  password: z.string().refine(isPasswordCompliant, PASSWORD_POLICY_MESSAGE),
})

export const accountCreationSchema = registrationSchema.extend({
  termsAccepted: z.boolean().refine(Boolean, TERMS_ACCEPTANCE_MESSAGE),
  privacyAccepted: z.boolean().refine(Boolean, PRIVACY_ACCEPTANCE_MESSAGE),
})

export type AuthUser = z.infer<typeof authUserSchema>
export type Credentials = z.infer<typeof credentialsSchema>

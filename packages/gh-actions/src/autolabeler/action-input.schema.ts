import type * as z from 'zod'
import { boolean, object, string, stringbool } from 'zod'
import { sharedInputSchema } from '../common/shared-input.schema.ts'

export const actionInputSchema = object({
  'config-name': string().optional().default('release-drafter.yml'),
  summary: stringbool().or(boolean()).optional().default(true),
}).and(sharedInputSchema)
export type ActionInput = z.infer<typeof actionInputSchema>

import type * as z from 'zod'
import { boolean, object, string, stringbool } from 'zod'
import { tokenInputSchema } from '../common/shared-input.schema.ts'

export const actionInputSchema = object({
  'config-name': string().optional().default('release-drafter.yml'),
  summary: stringbool().or(boolean()).optional().default(true),
}).and(tokenInputSchema)

export type ActionInput = z.infer<typeof actionInputSchema>

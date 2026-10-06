import { commonConfigSchema } from '@release-drafter/core'
import type * as z from 'zod'
import { boolean, object, string, stringbool } from 'zod'
import { sharedInputSchema } from '../common/shared-input.schema.ts'

const exclusiveInputSchema = object({
  'config-name': string().optional().default('release-drafter.yml'),
  /** Ref, tag, branch, or commit SHA used only as the change comparison base. */
  from: string().optional(),
  name: string().optional(),
  tag: string().optional(),
  version: string().optional(),
  publish: stringbool().optional().default(false),
  summary: stringbool().or(boolean()).optional().default(true),
}).and(sharedInputSchema)

export const actionInputSchema = exclusiveInputSchema.and(commonConfigSchema)
export type ActionInput = z.infer<typeof actionInputSchema>

import { defineActionInputNames } from '../common/action-contract.ts'
import type { ActionInput } from './action-input.schema.ts'

export const actionInputNames = defineActionInputNames<ActionInput>()([
  'token',
  'config-name',
  'dry-run',
  'summary',
  'pr-comment',
])

export const actionOutputNames = ['number', 'labels'] as const

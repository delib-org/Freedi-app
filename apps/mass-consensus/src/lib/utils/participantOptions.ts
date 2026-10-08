import { ADD_OPTION_CODES } from '@/constants/common';
import type { MergedQuestionSettings } from './settingsUtils';

/**
 * Did an add-option route (submit / merge / prepare) refuse because the
 * question is "admin options only"? Safe on any parsed JSON body.
 */
export function isAddDisabledResponse(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;

  return (body as { code?: unknown }).code === ADD_OPTION_CODES.DISABLED;
}

/**
 * May this participant add their own options to the question?
 *
 * One answer for every participant surface (prompts, buttons, listeners,
 * modal mounts), so they cannot drift apart:
 * - a server-side block (standalone question page, looked up with the Admin
 *   SDK) always wins;
 * - a per-question `blockParticipantOptions` in the merged survey settings
 *   wins next, whatever the survey-wide switch says;
 * - otherwise the merged `allowParticipantsToAddSuggestions`, defaulting to
 *   true when there is no survey at all (the standalone page today).
 */
export function resolveCanAddOptions(
  mergedSettings: MergedQuestionSettings | undefined,
  blockedByServer = false,
): boolean {
  if (blockedByServer) return false;
  if (mergedSettings?.blockParticipantOptions) return false;

  return mergedSettings?.allowParticipantsToAddSuggestions ?? true;
}

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

/** HTTP status the merge route uses when the same-idea judge refuses a merge. */
export const MERGE_REFUSED_STATUS = 409;

/**
 * Did the merge route refuse because the server's same-idea judge found the
 * text is not the same idea as the target? Nothing was merged then — the
 * caller should add the text as a new suggestion. Safe on any parsed body.
 */
export function isMergeRefusedAsDifferentIdea(status: number, body: unknown): boolean {
  if (status !== MERGE_REFUSED_STATUS) return false;
  if (typeof body !== 'object' || body === null) return false;

  return (body as { notSameIdea?: unknown }).notSameIdea === true;
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

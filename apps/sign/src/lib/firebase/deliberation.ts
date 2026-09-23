import { getFunctions, httpsCallable } from 'firebase/functions';
import { DeliberationStatus, DELIBERATION_LIMITS } from '@freedi/shared-types';
import { getFirebaseAuth } from './client';
export const AGREEMENT_POLL_MS = DELIBERATION_LIMITS.pollMs;
export function requestDeliberation(input: Record<string, unknown>) {
 const service = getFunctions(getFirebaseAuth().app, process.env.NEXT_PUBLIC_DELIBERATION_FUNCTIONS_URL || 'me-west1');
 return httpsCallable<Record<string, unknown>, DeliberationStatus>(service, 'deliberation')(input);
}
export function redeemAgreementHandoff(input: { code: string; documentId: string }) {
 const service = getFunctions(getFirebaseAuth().app, process.env.NEXT_PUBLIC_DELIBERATION_FUNCTIONS_URL || 'me-west1');
 return httpsCallable<typeof input, { token: string }>(service, 'redeemAgreementHandoff')(input);
}

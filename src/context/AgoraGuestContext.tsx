import { createContext, useContext } from 'react';
import type { AgoraGuestClaim } from '@freedi/shared-types';

/**
 * The Agora guest claim of whoever is signed in, or null. Provided by
 * `AgoraGuestGate` at the root, so any screen can ask "is this a student
 * from an Agora station?" without its own auth listener.
 */
export const AgoraGuestContext = createContext<AgoraGuestClaim | null>(null);

export function useAgoraGuest(): AgoraGuestClaim | null {
	return useContext(AgoraGuestContext);
}

import {
	getDatabase,
	connectDatabaseEmulator,
	Database,
	ref as rtdbRef,
	set as rtdbSet,
	update as rtdbUpdate,
	remove as rtdbRemove,
	onValue as rtdbOnValue,
	onDisconnect as rtdbOnDisconnect,
	OnDisconnect,
	DatabaseReference,
	Unsubscribe as RtdbUnsubscribe,
} from 'firebase/database';
import { app, emulatorPort, isLocalhost } from './firebase';

/**
 * Realtime Database, kept out of the student entry. The SDK is ~40 kB gzipped
 * and only the live-draft broadcast (Proposals) and the one-off server clock
 * read need it, so it is imported by those modules only: liveDrafts (from the
 * lazy lesson-part-2 screens) and serverClock (through a dynamic import).
 *
 * Initialised on first use. Null when VITE_FIREBASE_DATABASE_URL is absent —
 * those features no-op.
 */

let rtdb: Database | null = null;
let initialised = false;

function init(): void {
	initialised = true;
	if (!import.meta.env.VITE_FIREBASE_DATABASE_URL) return;
	rtdb = getDatabase(app);
	if (!isLocalhost()) return;
	try {
		connectDatabaseEmulator(rtdb, 'localhost', emulatorPort('VITE_EMULATOR_DATABASE_PORT', 9000));
	} catch (error) {
		console.error('[Firebase] Database emulator connection failed:', error);
	}
}

export function getRtdb(): Database | null {
	if (!initialised) init();

	return rtdb;
}

export { rtdbRef, rtdbSet, rtdbUpdate, rtdbRemove, rtdbOnValue, rtdbOnDisconnect };

export type { Database, DatabaseReference, OnDisconnect, RtdbUnsubscribe };

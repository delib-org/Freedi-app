/**
 * Local emulator ports for the browser SDKs (match firebase.json).
 * The client talks to the emulators whenever the page is served from localhost.
 */
export const CLIENT_EMULATORS = {
  host: 'localhost',
  authPort: 9099,
  firestorePort: 8081,
  storagePort: 9199,
  functionsPort: 5001,
} as const;

export function isClientEmulatorMode(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === CLIENT_EMULATORS.host;
}

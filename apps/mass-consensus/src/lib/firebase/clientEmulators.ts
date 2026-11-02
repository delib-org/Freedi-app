/**
 * Local emulator ports for the browser SDKs (match firebase.json).
 * The client talks to the emulators whenever the page is served from localhost.
 */
/** A port from NEXT_PUBLIC_EMULATOR_*_PORT (a worktree running its own suite), else the default. */
function portFromEnv(value: string | undefined, fallback: number): number {
  const port = Number(value);

  return Number.isInteger(port) && port > 0 ? port : fallback;
}

export const CLIENT_EMULATORS = {
  host: 'localhost',
  authPort: portFromEnv(process.env.NEXT_PUBLIC_EMULATOR_AUTH_PORT, 9099),
  firestorePort: portFromEnv(process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT, 8081),
  storagePort: portFromEnv(process.env.NEXT_PUBLIC_EMULATOR_STORAGE_PORT, 9199),
  functionsPort: portFromEnv(process.env.NEXT_PUBLIC_EMULATOR_FUNCTIONS_PORT, 5001),
} as const;

export function isClientEmulatorMode(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === CLIENT_EMULATORS.host;
}

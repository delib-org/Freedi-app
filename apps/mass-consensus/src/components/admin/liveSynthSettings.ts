/** `liveSynthEnabled` is stored on survey and question settings without being in their schemas. */
export function readLiveSynthFromSettings(settings: unknown): boolean | undefined {
  if (!settings || typeof settings !== 'object') return undefined;
  const raw = (settings as Record<string, unknown>)['liveSynthEnabled'];
  if (raw === true) return true;
  if (raw === false) return false;

  return undefined;
}

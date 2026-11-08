const FIRST_PRINTABLE_CHAR_CODE = 0x20;
const DELETE_CHAR_CODE = 0x7f;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);

    return code < FIRST_PRINTABLE_CHAR_CODE || code === DELETE_CHAR_CODE;
  });
}

/**
 * Allow only a same-origin relative path as a post-login destination, so a
 * crafted `?redirect=` link cannot send someone to another site after sign-in.
 *
 * Rejected: protocol-relative `//host`, backslashes (browsers treat `\` as `/`),
 * control characters (browsers strip them, so `/\t/host` becomes `//host`) and
 * any scheme such as `javascript:`.
 */
export function safeRedirectPath(target: string | null | undefined, fallback: string): string {
  if (!target) return fallback;

  const isRelativePath = target.startsWith('/') && !target.startsWith('//');
  if (!isRelativePath || target.includes('\\') || hasControlCharacter(target)) {
    return fallback;
  }

  return target;
}

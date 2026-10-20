/**
 * Which picture URLs next/image may resize and re-encode.
 *
 * Card and survey pictures are stored full size (often 1-3MB phone photos) in
 * Cloud Storage under a fresh name per upload, so a resized WebP/AVIF copy can
 * be cached for good. Only the hosts listed in next.config.js images.remotePatterns
 * qualify; anything else (the local Storage emulator, a pasted external link)
 * is shown as-is.
 */

const OPTIMIZABLE_HOSTS: readonly string[] = [
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
];

/** Card width on phones is the viewport; it never grows past ~560px. */
export const CARD_IMAGE_SIZES = '(max-width: 640px) 100vw, 560px';

/**
 * next/image needs a width and height; card pictures come in any shape, so
 * these only set a 4:3 placeholder ratio — CSS (height: auto) lets the loaded
 * picture keep its own proportions.
 */
export const CARD_IMAGE_INTRINSIC = { width: 1080, height: 810 } as const;

/** Explanation-page hero: full width up to the page column. */
export const HERO_IMAGE_SIZES = '(max-width: 768px) 100vw, 768px';

export function isOptimizableImageUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);

    return protocol === 'https:' && OPTIMIZABLE_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}

/**
 * The rules for a library cover, free of the browser so they can be tested:
 * which files are accepted and how far a picture is shrunk.
 */

export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_MAX_SIDE = 1600;
export const COVER_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
export const COVER_QUALITY = 0.85;

export type CoverProblem = 'type' | 'size';

export function coverProblem(file: Pick<File, 'type' | 'size'>): CoverProblem | null {
	if (!COVER_TYPES.includes(file.type)) return 'type';
	if (file.size > COVER_MAX_BYTES) return 'size';

	return null;
}

/** The size after shrinking to fit `max` on the long side; never enlarges */
export function fitWithin(
	width: number,
	height: number,
	max: number,
): { width: number; height: number } {
	const longest = Math.max(width, height);
	if (longest <= max) return { width, height };
	const scale = max / longest;

	return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

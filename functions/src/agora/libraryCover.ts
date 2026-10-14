import { AgoraTopicPackage } from '@freedi/shared-types';

/**
 * The pure parts of the AI cover: what the model is told (from the scenario's
 * own content only — never a student's words), where the picture is stored,
 * and the download URL the publish callable will accept for it.
 */

/** File-name prefix of a generated cover; the publish callable reads it to set `coverSource: 'ai'` */
export const AI_COVER_PREFIX = 'library-cover-ai-';

/**
 * The look every cover shares, so the library reads as one family and matches
 * the game's own illustrated artwork. No text, no faces of real people.
 */
export const COVER_STYLE =
	'Warm, friendly digital illustration in a flat storybook style with soft shapes, ' +
	'gentle lighting and a clear central scene, suitable for a classroom of 12 to 15 year olds. ' +
	'Wide landscape composition. Absolutely no text, no letters, no numbers, no captions, ' +
	'no logos, no flags or political symbols, no real or recognisable people, no weapons, ' +
	'nothing frightening or violent.';

export interface CoverSource {
	title: string;
	summary: string;
	framingText: string;
	challengeQuestion: string;
	characters: string[];
	scenes: string[];
}

const MAX_FIELD = 600;

const clip = (text: string | undefined, max = MAX_FIELD): string =>
	(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** What the scenario says about itself: the author's words, nothing from any lesson run with it */
export function coverSourceOf(pkg: AgoraTopicPackage, summary?: string): CoverSource {
	return {
		title: clip(pkg.title, 120),
		summary: clip(summary ?? pkg.library?.summary),
		framingText: clip(pkg.framingText),
		challengeQuestion: clip(pkg.challengeQuestion, 240),
		characters: pkg.characters.slice(0, 6).map((entry) => clip(entry.role, 60)),
		scenes: pkg.scenes.slice(0, 6).map((entry) => clip(entry.title, 80)),
	};
}

/** The instruction that turns the scenario into one picture idea, in English */
export function sceneBriefPrompt(source: CoverSource): { system: string; user: string } {
	return {
		system:
			'You write one-sentence picture ideas for the cover of a classroom lesson scenario. ' +
			'Reply with a single English sentence (max 40 words) describing ONE calm, concrete, ' +
			'child-appropriate scene or symbolic image that conveys the theme. ' +
			'No text in the picture, no named real people, no flags, no violence. ' +
			'Do not mention the words "cover", "poster" or "book".',
		user: [
			`Title: ${source.title}`,
			source.summary && `Summary: ${source.summary}`,
			source.framingText && `Setting: ${source.framingText}`,
			source.challengeQuestion && `Question the class debates: ${source.challengeQuestion}`,
			source.characters.length > 0 && `Roles: ${source.characters.join(', ')}`,
			source.scenes.length > 0 && `Scenes: ${source.scenes.join(', ')}`,
		]
			.filter(Boolean)
			.join('\n'),
	};
}

/** Used when the brief cannot be written: the title and summary, plainly */
export function fallbackBrief(source: CoverSource): string {
	return `A scene that conveys the theme "${source.title}". ${source.summary}`.slice(0, 400);
}

/** The full prompt the image model gets */
export function coverPrompt(brief: string): string {
	return `${clip(brief, 400)}\n\nStyle: ${COVER_STYLE}`;
}

export function coverObjectPath(scenarioId: string, now: number): string {
	return `agora/${scenarioId}/${AI_COVER_PREFIX}${now}.webp`;
}

/**
 * A Storage download URL for an object, served by the emulator when one is
 * running. Matches what `isScenarioCoverUrl` accepts for that scenario.
 */
export function coverDownloadUrl(
	bucket: string,
	objectPath: string,
	token: string,
	emulatorHost: string | undefined,
): string {
	const encoded = encodeURIComponent(objectPath);
	const base = emulatorHost
		? `http://${emulatorHost}/v0/b/${bucket}/o/${encoded}`
		: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}`;

	return `${base}?alt=media&token=${token}`;
}

/** Did the server generate this cover (as opposed to the teacher uploading it)? */
export function isAiCoverUrl(url: string): boolean {
	try {
		return decodeURIComponent(new URL(url).pathname).includes(`/${AI_COVER_PREFIX}`);
	} catch {
		return false;
	}
}

/** The image model, the size and the quality used, and what that costs — one place to change them */
export const COVER_IMAGE = {
	MODEL: process.env.AGORA_COVER_IMAGE_MODEL || 'gpt-image-1-mini',
	SIZE: '1536x1024',
	QUALITY: 'medium',
	/**
	 * Approximate list price in USD for one 1536x1024 medium image on gpt-image-1-mini.
	 * Recorded from OpenAI's published pricing at design time; not fetched live.
	 */
	APPROX_COST_USD: 0.015,
} as const;

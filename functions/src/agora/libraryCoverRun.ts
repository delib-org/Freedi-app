import { coverPrompt, CoverSource, fallbackBrief } from './libraryCover';
import type { CoverProvider } from './libraryCoverProvider';

export type CoverOutcome = { kind: 'image'; bytes: Buffer } | { kind: 'refused' };

/**
 * Brief → moderation → picture. A brief that cannot be written falls back to
 * the title and summary; a prompt the moderation flags is refused outright
 * (nothing is painted, and the caller does not charge the teacher).
 */
export async function runCover(
	source: CoverSource,
	provider: CoverProvider,
	log: (error: unknown) => void,
): Promise<CoverOutcome> {
	let brief: string;
	try {
		brief = (await provider.writeBrief(source)) || fallbackBrief(source);
	} catch (error) {
		log(error);
		brief = fallbackBrief(source);
	}
	const prompt = coverPrompt(brief);
	let flagged = false;
	try {
		flagged = await provider.flagged(`${source.title}\n${source.summary}\n${brief}`);
	} catch (error) {
		// Moderation being down must not paint unchecked text for children
		log(error);
		flagged = true;
	}
	if (flagged) return { kind: 'refused' };

	return { kind: 'image', bytes: await provider.paint(prompt) };
}

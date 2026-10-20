import type { OdysseyTranslationLang } from './odysseyTranslation';

/**
 * Wire contracts of the Odyssey callables.
 *
 * Declared once, imported by both the Odyssey client
 * (`apps/odyssey/src/lib/callables.ts`) and the functions
 * (`functions/src/odyssey/fn_*.ts`), so a drift between the two sides is a
 * compile error rather than a runtime surprise.
 *
 * Field names are the wire format. Do not rename them.
 */

/** `odysseyMintAgoraHandoff` */
export interface MintAgoraHandoffResponse {
	token: string;
	uid: string;
}

/** `odysseyTranslateGame` — admin action: (re)translate one game into one language. */
export interface OdysseyTranslateGameRequest {
	gameId: string;
	lang: OdysseyTranslationLang;
	/** Re-translate every field, ignoring the stored source hashes. */
	force?: boolean;
	/**
	 * Only count: how many fields WOULD be translated. Calls no model and
	 * writes nothing — the admin screen's "N fields out of date" line.
	 */
	dryRun?: boolean;
}

export interface OdysseyTranslateGameResponse {
	lang: OdysseyTranslationLang;
	/** Fields translated in this call (on a dry run: fields that would be) */
	translated: number;
	/** Fields whose Hebrew was unchanged since their last translation */
	skipped: number;
	/** Fields whose chunk failed; their previous translation (if any) is kept */
	failed: number;
	/** Translatable fields in the game */
	total: number;
}

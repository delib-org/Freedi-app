import type { DocumentReference } from 'firebase-admin/firestore';
import { db } from '../db';
import {
	AgoraScenarioCardText,
	AgoraScenarioTranslation,
	AgoraTopicPackage,
	Collections,
	createAgoraTranslationId,
} from '@freedi/shared-types';
import {
	applyPackageStrings,
	cardStringsOf,
	cardTextFrom,
	collectPackageStrings,
} from './libraryStrings';
import { translateStrings } from './libraryTranslate';

/**
 * Scenario translations, cached per scenario per language in
 * `agoraScenarioTranslations/{scenarioId}__{lang}`.
 *
 * A cached translation is valid while the scenario's `lastUpdate` is the one it
 * was made from (and, for the card, while the library summary is the same
 * words). A scenario that is edited simply stops matching and is translated
 * again the next time someone looks — views never re-pay for an unchanged
 * scenario.
 */

const translationRef = (scenarioId: string, lang: string): DocumentReference =>
	db
		.collection(Collections.agoraScenarioTranslations)
		.doc(createAgoraTranslationId(scenarioId, lang));

async function readFresh(
	pkg: AgoraTopicPackage,
	lang: string,
): Promise<AgoraScenarioTranslation | null> {
	const snap = await translationRef(pkg.topicPackageId, lang).get();
	const cached = snap.data() as AgoraScenarioTranslation | undefined;

	return cached && cached.sourceVersion === pkg.lastUpdate ? cached : null;
}

/** The title, summary and lesson preview of a scenario in `lang` */
export async function translatedCard(
	pkg: AgoraTopicPackage,
	lang: string,
): Promise<AgoraScenarioCardText> {
	const summary = pkg.library?.summary ?? '';
	const cached = await readFresh(pkg, lang);
	if (cached?.card && cached.summarySource === summary) return cached.card;

	const translated = await translateStrings(cardStringsOf(pkg, summary), pkg.language, lang);
	const card = cardTextFrom(pkg, translated);
	const now = Date.now();
	await translationRef(pkg.topicPackageId, lang).set(
		{
			translationId: createAgoraTranslationId(pkg.topicPackageId, lang),
			scenarioId: pkg.topicPackageId,
			lang,
			sourceVersion: pkg.lastUpdate,
			summarySource: summary,
			card,
			// Strings translated from an older version of the scenario are stale
			...(cached ? {} : { strings: [] }),
			createdAt: cached?.createdAt ?? now,
			lastUpdate: now,
		} satisfies AgoraScenarioTranslation,
		{ merge: true },
	);

	return card;
}

/** The whole scenario, written in `lang`; what "use" hands the teacher */
export async function translatedPackage(
	pkg: AgoraTopicPackage,
	lang: string,
): Promise<AgoraTopicPackage> {
	const expected = collectPackageStrings(pkg).length;
	const cached = await readFresh(pkg, lang);
	let strings = cached?.strings && cached.strings.length === expected ? cached.strings : null;
	if (!strings) {
		strings = await translateStrings(collectPackageStrings(pkg), pkg.language, lang);
		const now = Date.now();
		await translationRef(pkg.topicPackageId, lang).set(
			{
				translationId: createAgoraTranslationId(pkg.topicPackageId, lang),
				scenarioId: pkg.topicPackageId,
				lang,
				sourceVersion: pkg.lastUpdate,
				strings,
				createdAt: cached?.createdAt ?? now,
				lastUpdate: now,
			} satisfies Partial<AgoraScenarioTranslation>,
			{ merge: true },
		);
	}

	return { ...applyPackageStrings(pkg, strings), language: lang };
}

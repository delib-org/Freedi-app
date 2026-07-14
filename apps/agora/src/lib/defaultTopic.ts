import {
	AgoraSceneKind,
	AgoraTopicPackage,
	AgoraTopicStatus,
} from '@freedi/shared-types';

/**
 * The built-in French Revolution scenario (Hebrew). A teacher who signs in
 * for the first time has no topic packages of their own, so we auto-provision
 * this ready-to-run game for them — they can open a session immediately, or
 * edit it as a starting point. Kept in sync with scripts/seed.ts.
 */

const ROYALIST_ID = 'char-royalist';
const JACOBIN_ID = 'char-jacobin';

/** Deterministic per-teacher id so re-provisioning never duplicates the package */
export function defaultTopicPackageId(creatorId: string): string {
	return `french-revolution-${creatorId}`;
}

/**
 * Backfill the bundled default scene media (images + video) into a package
 * that was provisioned before that media existed. Fills each field only when
 * the scene currently has none of it — never overwrites images or videos a
 * teacher added. Returns a partial patch (scenes and/or characters), or null
 * if nothing needed changing.
 */
export function backfillDefaultArtwork(
	pkg: AgoraTopicPackage,
): Partial<Pick<AgoraTopicPackage, 'scenes' | 'characters' | 'artwork'>> | null {
	const defaults = buildDefaultFrenchRevolutionTopic(pkg.creatorId);
	const defaultsBySceneId = new Map<string, AgoraTopicPackage['scenes'][number]>();
	for (const scene of defaults.scenes) {
		defaultsBySceneId.set(scene.sceneId, scene);
	}
	const defaultsByCharacterId = new Map<string, AgoraTopicPackage['characters'][number]>();
	for (const character of defaults.characters) {
		defaultsByCharacterId.set(character.characterId, character);
	}

	let changed = false;
	const scenes = pkg.scenes.map((scene) => {
		const scDefault = defaultsBySceneId.get(scene.sceneId);
		if (!scDefault) return scene;

		let next = scene;
		// Fill default images only if this scene has no image of its own.
		if (scDefault.imageUrls.length > 0 && scene.imageUrls.length === 0) {
			next = { ...next, imageUrls: [...scDefault.imageUrls] };
			changed = true;
		}
		// Fill the default video only if this scene has no video of its own.
		if (scDefault.videoUrl && !scene.videoUrl) {
			next = { ...next, videoUrl: scDefault.videoUrl };
			changed = true;
		}

		return next;
	});

	// Fill each character's default portrait only if it has none of its own.
	const characters = pkg.characters.map((character) => {
		const chDefault = defaultsByCharacterId.get(character.characterId);
		if (chDefault?.portraitUrl && !character.portraitUrl) {
			changed = true;

			return { ...character, portraitUrl: chDefault.portraitUrl };
		}

		return character;
	}) as AgoraTopicPackage['characters'];

	// Fill the deliberation square art only if the package has none.
	const defaultSquare = defaults.artwork?.locationVignetteUrls?.square;
	let artwork = pkg.artwork;
	if (defaultSquare && !pkg.artwork?.locationVignetteUrls?.square) {
		artwork = {
			...pkg.artwork,
			locationVignetteUrls: {
				...pkg.artwork?.locationVignetteUrls,
				square: defaultSquare,
			},
		};
		changed = true;
	}

	return changed ? { scenes, characters, artwork } : null;
}

export function buildDefaultFrenchRevolutionTopic(creatorId: string): AgoraTopicPackage {
	const now = Date.now();

	return {
		topicPackageId: defaultTopicPackageId(creatorId),
		creatorId,
		topic: 'המהפכה הצרפתית',
		language: 'he',
		status: AgoraTopicStatus.ready,
		title: 'המהפכה הצרפתית — 1789',
		framingText:
			'הכיתה שלכם נבחרה למשימה נועזת: לחזור בזמן לצרפת של 1789, רגע לפני שהמהפכה יוצאת משליטה. העם רעב, האוצר ריק, והמדינה עומדת על סף מלחמת אזרחים. בני התקופה מבקשים את עזרתכם במציאת פתרון שיהיה מקובל על כל הצדדים — לפני שיהיה מאוחר מדי.',
		characters: [
			{
				characterId: ROYALIST_ID,
				name: 'הרוזן דה-לה-רוש',
				role: 'אציל מלוכני',
				portraitUrl: '/scenes/char-royalist.png',
				arguments: [
					'המלוכה היא סדר. בלי מלך, צרפת תתפרק לכאוס ולשפיכות דמים.',
					'המסורת והכנסייה מחזיקות את החברה יחד כבר אלף שנה.',
					'שינויים חייבים לבוא בהדרגה, מלמעלה, בידי מי שיודע לנהל ממלכה.',
				],
				needs: [
					'אני צריך לדעת שמשפחתי לא תיפגע ושאחוזתי לא תישרף בידי המון זועם.',
					'אני צריך שהעולם שגדלתי בו לא ייעלם בן לילה — שיישאר משהו מהמסורת שלנו.',
					'אני צריך כבוד — שלא יראו בי אויב רק בגלל המעמד שנולדתי אליו.',
				],
				values: [
					{ valueId: 'val-order', label: 'סדר ויציבות', description: 'חשש עמוק מכאוס ומאלימות המונים' },
					{ valueId: 'val-tradition', label: 'מסורת', description: 'כבוד למוסדות ההיסטוריים — הכתר והכנסייה' },
					{ valueId: 'val-hierarchy', label: 'היררכיה', description: 'אמונה שהנהגה דורשת ניסיון ומעמד' },
				],
			},
			{
				characterId: JACOBIN_ID,
				name: 'קמיל דופון',
				role: 'עורך דין יעקוביני',
				portraitUrl: '/scenes/char-jacobin.png',
				arguments: [
					'העם גווע ברעב בזמן שהארמון עורך נשפים. זה חייב להיגמר.',
					'כל אדם נולד חופשי ושווה — אין זכויות יתר מלידה.',
					'רק שלטון של העם, למען העם, יביא צדק לצרפת.',
				],
				needs: [
					'אני צריך שלילדים שלנו יהיה לחם על השולחן — ביטחון קיומי בסיסי.',
					'אני צריך שישמעו אותנו — שלעם יהיה קול אמיתי בהחלטות שמעצבות את חייו.',
					'אני צריך צדק — שהחוק יחול על כולם באותה מידה, גם על החזקים.',
				],
				values: [
					{ valueId: 'val-equality', label: 'שוויון', description: 'ביטול זכויות היתר של האצולה' },
					{ valueId: 'val-liberty', label: 'חירות', description: 'חופש הפרט מול שלטון עריץ' },
					{ valueId: 'val-popular', label: 'ריבונות העם', description: 'הלגיטימציה לשלטון באה מהעם בלבד' },
				],
			},
		],
		positioningScale: {
			leftLabel: 'מלוכנים',
			rightLabel: 'יעקובינים',
			leftCharacterId: ROYALIST_ID,
			rightCharacterId: JACOBIN_ID,
		},
		challengeQuestion: 'מה צריך לעשות כדי לבנות שלטון צודק ויציב בצרפת — בלי להידרדר לטרור או לרעב?',
		valueAnswerKey: [
			{
				characterId: ROYALIST_ID,
				expectedValues: [
					{ valueId: 'val-order', label: 'סדר ויציבות', description: 'חשש עמוק מכאוס ומאלימות המונים' },
					{ valueId: 'val-tradition', label: 'מסורת', description: 'כבוד למוסדות ההיסטוריים — הכתר והכנסייה' },
					{ valueId: 'val-hierarchy', label: 'היררכיה', description: 'אמונה שהנהגה דורשת ניסיון ומעמד' },
				],
			},
			{
				characterId: JACOBIN_ID,
				expectedValues: [
					{ valueId: 'val-equality', label: 'שוויון', description: 'ביטול זכויות היתר של האצולה' },
					{ valueId: 'val-liberty', label: 'חירות', description: 'חופש הפרט מול שלטון עריץ' },
					{ valueId: 'val-popular', label: 'ריבונות העם', description: 'הלגיטימציה לשלטון באה מהעם בלבד' },
				],
			},
		],
		plausibilityRubric: {
			criteria: [
				{
					criterionId: 'crit-period',
					label: 'התאמה לתקופה',
					description: 'הפתרון אפשרי בטכנולוגיה, במוסדות ובידע של 1789',
					weight: 0.4,
				},
				{
					criterionId: 'crit-feasible',
					label: 'ישימות פוליטית',
					description: 'לפחות חלק מהכוחות בתקופה היו יכולים לקבל את הפתרון',
					weight: 0.35,
				},
				{
					criterionId: 'crit-specific',
					label: 'קונקרטיות',
					description: 'הפתרון מציע צעדים ממשיים ולא סיסמאות',
					weight: 0.25,
				},
			],
		},
		healthMetrics: [
			{ metricId: 'met-bread', label: 'מחיר הלחם', description: 'יוקר המחיה של פשוטי העם', min: 0, max: 100, baseline: 25, higherIsBetter: false },
			{ metricId: 'met-stability', label: 'יציבות שלטונית', description: 'הסיכוי להימנע ממלחמת אזרחים', min: 0, max: 100, baseline: 30 },
			{ metricId: 'met-rights', label: 'זכויות האזרח', description: 'חירויות הפרט והשוויון בפני החוק', min: 0, max: 100, baseline: 20 },
			{ metricId: 'met-treasury', label: 'קופת המדינה', description: 'יכולת המדינה לממן את עצמה', min: 0, max: 100, baseline: 15 },
		],
		scenes: [
			{
				sceneId: 'scene-intro',
				kind: AgoraSceneKind.intro,
				title: 'המשימה',
				text: 'צרפת, 1789. הממלכה על סף תהום. אתם — נוסעי הזמן — המשימה שלכם: למצוא פתרון שכל הצדדים יוכלו לחיות איתו.',
				imageUrls: ['/scenes/time-machine-briefing.png'],
				dialogue: [],
			},
			{
				sceneId: 'scene-tunnel',
				kind: AgoraSceneKind.timeTunnel,
				title: 'מנהרת הזמן',
				text: 'המנהרה נפתחת. אורות חולפים על פניכם — מאתיים שנה אחורה. כשהערפל מתפזר, אתם עומדים ברחובות פריז.',
				videoUrl: '/scenes/time-tunnel.mp4',
				// still used as the video poster (instant frame before autoplay + fallback)
				imageUrls: ['/scenes/time-tunnel.png'],
				dialogue: [],
			},
			{
				sceneId: 'scene-period',
				kind: AgoraSceneKind.periodExplainer,
				title: 'פריז, 1789',
				text: 'המדינה שקועה בחובות אחרי מלחמות יקרות. הקציר נכשל ומחיר הלחם הכפיל את עצמו. האצולה והכנסייה פטורות ממס, והעם נושא בנטל. המלך לואי ה-16 כינס את אספת המעמדות — בפעם הראשונה מזה 175 שנה.',
				imageUrls: ['/scenes/french-revolution-intro.png'],
				dialogue: [],
			},
			{
				sceneId: 'scene-royalist',
				kind: AgoraSceneKind.perspectiveA,
				title: 'בארמון',
				text: 'הרוזן דה-לה-רוש מקבל אתכם בטרקלין מוזהב.',
				imageUrls: ['/scenes/perspective-royalist.png'],
				dialogue: [
					{ speaker: 'הרוזן דה-לה-רוש', line: 'ברוכים הבאים. שמעתי שבאתם מרחוק לעזור לצרפת.' },
					{ speaker: 'הרוזן דה-לה-רוש', line: 'המלוכה היא סדר. בלי מלך, צרפת תתפרק לכאוס ולשפיכות דמים. ראיתם מה קורה כשההמון משתלט על הרחוב?' },
					{ speaker: 'הרוזן דה-לה-רוש', line: 'המסורת והכנסייה מחזיקות את החברה יחד כבר אלף שנה. שינויים חייבים לבוא בהדרגה, מלמעלה.' },
				],
			},
			{
				sceneId: 'scene-jacobin',
				kind: AgoraSceneKind.perspectiveB,
				title: 'בבית הקפה',
				text: 'קמיל דופון יושב בבית קפה הומה, מוקף בעיתונים ובכרוזים.',
				imageUrls: ['/scenes/perspective-jacobin.png'],
				dialogue: [
					{ speaker: 'קמיל דופון', line: 'שבו, שבו. תראו מה כתוב כאן — מחיר הלחם עלה שוב, והמלכה מזמינה תכשיטים.' },
					{ speaker: 'קמיל דופון', line: 'העם גווע ברעב בזמן שהארמון עורך נשפים. כל אדם נולד חופשי ושווה — אין זכויות יתר מלידה.' },
					{ speaker: 'קמיל דופון', line: 'רק שלטון של העם, למען העם, יביא צדק לצרפת. השאלה היא רק איך — ובאיזה מחיר.' },
				],
			},
			{
				sceneId: 'scene-needs-q',
				kind: AgoraSceneKind.needsQuestion,
				title: 'השאלה שמשנה הכל',
				text: 'שמעתם את העמדות של שני הצדדים. עכשיו אתם פונים אליהם ושואלים את השאלה שמאחורי הוויכוח: "מה אתם בעצם צריכים?"',
				imageUrls: ['/scenes/needs-question.png'],
				dialogue: [],
			},
			{
				sceneId: 'scene-needs-a',
				kind: AgoraSceneKind.needsA,
				title: 'הרוזן נפתח',
				text: 'הרוזן דה-לה-רוש שותק רגע ארוך. ואז, בקול שקט יותר, הוא עונה.',
				imageUrls: ['/scenes/needs-royalist.png'],
				dialogue: [
					{ speaker: 'הרוזן דה-לה-רוש', line: 'אני צריך לדעת שמשפחתי לא תיפגע ושאחוזתי לא תישרף בידי המון זועם.' },
					{ speaker: 'הרוזן דה-לה-רוש', line: 'אני צריך שהעולם שגדלתי בו לא ייעלם בן לילה — שיישאר משהו מהמסורת שלנו.' },
					{ speaker: 'הרוזן דה-לה-רוש', line: 'ואני צריך כבוד — שלא יראו בי אויב רק בגלל המעמד שנולדתי אליו.' },
				],
			},
			{
				sceneId: 'scene-needs-b',
				kind: AgoraSceneKind.needsB,
				title: 'קמיל נפתח',
				text: 'קמיל דופון מניח את העיתון. לרגע הוא לא נואם — הוא פשוט מדבר.',
				imageUrls: ['/scenes/needs-jacobin.png'],
				dialogue: [
					{ speaker: 'קמיל דופון', line: 'אני צריך שלילדים שלנו יהיה לחם על השולחן — ביטחון קיומי בסיסי.' },
					{ speaker: 'קמיל דופון', line: 'אני צריך שישמעו אותנו — שלעם יהיה קול אמיתי בהחלטות שמעצבות את חייו.' },
					{ speaker: 'קמיל דופון', line: 'ואני צריך צדק — שהחוק יחול על כולם באותה מידה, גם על החזקים.' },
				],
			},
			{
				sceneId: 'scene-success',
				kind: AgoraSceneKind.successEnding,
				title: 'הצלחתם!',
				text: 'הפתרון שלכם התקבל על ידי שני המחנות. צרפת פוסעת בדרך חדשה — בלי טרור, בלי רעב. ההיסטוריה תזכור את נוסעי הזמן שהצילו את המהפכה מעצמה.',
				imageUrls: ['/scenes/ending-success.png'],
				dialogue: [],
			},
			{
				sceneId: 'scene-honest-disagreement',
				kind: AgoraSceneKind.honestDisagreementEnding,
				title: 'מחלוקת כנה — הישג בפני עצמו',
				text: 'לא הצלתם את צרפת היום. אבל עשיתם משהו שצרפת של 1789 מעולם לא הצליחה לעשות — מצאתם בדיוק היכן חיה המחלוקת, והקשבתם זה לזה עד הסוף. מכאן מתחיל הניסיון הבא. מנהרת הזמן נשארת פתוחה.',
				imageUrls: ['/scenes/ending-honest-disagreement.png'],
				dialogue: [],
			},
			{
				sceneId: 'scene-failure',
				kind: AgoraSceneKind.failureEnding,
				title: 'המשימה נכשלה... הפעם',
				text: 'המחנות לא הצליחו להתקרב, והמהפכה גלשה לטרור. אבל מסע בזמן אפשר לנסות שוב — עכשיו אתם מבינים טוב יותר מה כל צד באמת צריך.',
				imageUrls: ['/scenes/ending-failure.png'],
				dialogue: [],
			},
		],
		// The deliberation stage's "location" art — the town square (agora)
		// where the class gathers to propose. Rendered as the delib banner.
		artwork: {
			locationVignetteUrls: { square: '/scenes/deliberation-square.png' },
		},
		createdAt: now,
		lastUpdate: now,
	};
}

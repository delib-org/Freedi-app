/**
 * Agora seed script — writes the demo French Revolution topic package
 * (Hebrew) into Firestore so a teacher can open a session immediately.
 *
 * Usage:
 *   npx tsx scripts/seed.ts           # seeds the Firestore emulator (localhost:8081)
 *   npx tsx scripts/seed.ts --prod    # seeds cloud Firestore (requires credentials)
 *   npx tsx scripts/seed.ts --clear   # clears the seeded package then re-seeds
 *
 * After running: open http://localhost:3009/#!/teach and create a session.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const USE_EMULATOR = !process.argv.includes('--prod');
const CLEAR_FIRST = process.argv.includes('--clear');

if (USE_EMULATOR) {
	process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
}

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'freedi-test' });
const db = getFirestore(app);

const TOPIC_PACKAGE_ID = 'demo-french-revolution';
const ROYALIST_ID = 'char-royalist';
const JACOBIN_ID = 'char-jacobin';

const now = Date.now();

const topicPackage = {
	topicPackageId: TOPIC_PACKAGE_ID,
	creatorId: 'seed-teacher',
	topic: 'המהפכה הצרפתית',
	language: 'he',
	status: 'ready',
	title: 'המהפכה הצרפתית — 1789',
	framingText:
		'הכיתה שלכם נבחרה למשימה נועזת: לחזור בזמן לצרפת של 1789, רגע לפני שהמהפכה יוצאת משליטה. העם רעב, האוצר ריק, והמדינה עומדת על סף מלחמת אזרחים. בני התקופה מבקשים את עזרתכם במציאת פתרון שיהיה מקובל על כל הצדדים — לפני שיהיה מאוחר מדי.',
	characters: [
		{
			characterId: ROYALIST_ID,
			name: 'הרוזן דה-לה-רוש',
			role: 'אציל מלוכני',
			arguments: [
				'המלוכה היא סדר. בלי מלך, צרפת תתפרק לכאוס ולשפיכות דמים.',
				'המסורת והכנסייה מחזיקות את החברה יחד כבר אלף שנה.',
				'שינויים חייבים לבוא בהדרגה, מלמעלה, בידי מי שיודע לנהל ממלכה.',
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
			arguments: [
				'העם גווע ברעב בזמן שהארמון עורך נשפים. זה חייב להיגמר.',
				'כל אדם נולד חופשי ושווה — אין זכויות יתר מלידה.',
				'רק שלטון של העם, למען העם, יביא צדק לצרפת.',
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
		{ metricId: 'met-bread', label: 'מחיר הלחם', description: 'יוקר המחיה של פשוטי העם', min: 0, max: 100, baseline: 25 },
		{ metricId: 'met-stability', label: 'יציבות שלטונית', description: 'הסיכוי להימנע ממלחמת אזרחים', min: 0, max: 100, baseline: 30 },
		{ metricId: 'met-rights', label: 'זכויות האזרח', description: 'חירויות הפרט והשוויון בפני החוק', min: 0, max: 100, baseline: 20 },
		{ metricId: 'met-treasury', label: 'קופת המדינה', description: 'יכולת המדינה לממן את עצמה', min: 0, max: 100, baseline: 15 },
	],
	scenes: [
		{
			sceneId: 'scene-intro',
			kind: 'intro',
			title: 'המשימה',
			text: 'צרפת, 1789. הממלכה על סף תהום. אתם — נוסעי הזמן — המשימה שלכם: למצוא פתרון שכל הצדדים יוכלו לחיות איתו.',
			imageUrls: [],
			dialogue: [],
		},
		{
			sceneId: 'scene-tunnel',
			kind: 'timeTunnel',
			title: 'מנהרת הזמן',
			text: 'המנהרה נפתחת. אורות חולפים על פניכם — מאתיים שנה אחורה. כשהערפל מתפזר, אתם עומדים ברחובות פריז.',
			imageUrls: [],
			dialogue: [],
		},
		{
			sceneId: 'scene-period',
			kind: 'periodExplainer',
			title: 'פריז, 1789',
			text: 'המדינה שקועה בחובות אחרי מלחמות יקרות. הקציר נכשל ומחיר הלחם הכפיל את עצמו. האצולה והכנסייה פטורות ממס, והעם נושא בנטל. המלך לואי ה-16 כינס את אספת המעמדות — בפעם הראשונה מזה 175 שנה.',
			imageUrls: [],
			dialogue: [],
		},
		{
			sceneId: 'scene-royalist',
			kind: 'perspectiveA',
			title: 'בארמון',
			text: 'הרוזן דה-לה-רוש מקבל אתכם בטרקלין מוזהב.',
			imageUrls: [],
			dialogue: [
				{ speaker: 'הרוזן דה-לה-רוש', line: 'ברוכים הבאים. שמעתי שבאתם מרחוק לעזור לצרפת.' },
				{ speaker: 'הרוזן דה-לה-רוש', line: 'המלוכה היא סדר. בלי מלך, צרפת תתפרק לכאוס ולשפיכות דמים. ראיתם מה קורה כשההמון משתלט על הרחוב?' },
				{ speaker: 'הרוזן דה-לה-רוש', line: 'המסורת והכנסייה מחזיקות את החברה יחד כבר אלף שנה. שינויים חייבים לבוא בהדרגה, מלמעלה.' },
			],
		},
		{
			sceneId: 'scene-jacobin',
			kind: 'perspectiveB',
			title: 'בבית הקפה',
			text: 'קמיל דופון יושב בבית קפה הומה, מוקף בעיתונים ובכרוזים.',
			imageUrls: [],
			dialogue: [
				{ speaker: 'קמיל דופון', line: 'שבו, שבו. תראו מה כתוב כאן — מחיר הלחם עלה שוב, והמלכה מזמינה תכשיטים.' },
				{ speaker: 'קמיל דופון', line: 'העם גווע ברעב בזמן שהארמון עורך נשפים. כל אדם נולד חופשי ושווה — אין זכויות יתר מלידה.' },
				{ speaker: 'קמיל דופון', line: 'רק שלטון של העם, למען העם, יביא צדק לצרפת. השאלה היא רק איך — ובאיזה מחיר.' },
			],
		},
		{
			sceneId: 'scene-success',
			kind: 'successEnding',
			title: 'הצלחתם!',
			text: 'הפתרון שלכם התקבל על ידי שני המחנות. צרפת פוסעת בדרך חדשה — בלי טרור, בלי רעב. ההיסטוריה תזכור את נוסעי הזמן שהצילו את המהפכה מעצמה.',
			imageUrls: [],
			dialogue: [],
		},
		{
			sceneId: 'scene-failure',
			kind: 'failureEnding',
			title: 'המשימה נכשלה... הפעם',
			text: 'המחנות לא הצליחו להתקרב, והמהפכה גלשה לטרור. אבל מסע בזמן אפשר לנסות שוב — עכשיו אתם מבינים טוב יותר מה כל צד באמת צריך.',
			imageUrls: [],
			dialogue: [],
		},
	],
	createdAt: now,
	lastUpdate: now,
};

async function clear(): Promise<void> {
	await db.collection('agoraTopicPackages').doc(TOPIC_PACKAGE_ID).delete();
	console.info('[Seed] Cleared demo topic package');
}

async function seed(): Promise<void> {
	if (CLEAR_FIRST) await clear();
	await db.collection('agoraTopicPackages').doc(TOPIC_PACKAGE_ID).set(topicPackage);
	console.info(`[Seed] Topic package "${topicPackage.title}" written (${TOPIC_PACKAGE_ID})`);
	console.info('[Seed] Open http://localhost:3009/#!/teach to create a session.');
}

seed().catch((error: unknown) => {
	console.error('[Seed] Failed:', error);
	process.exit(1);
});

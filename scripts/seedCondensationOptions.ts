/**
 * Seed ~200 option statements under a parent question, grouped into
 * ~15 semantic themes with synthetic embeddings so the condensation
 * pipeline can cluster them. Emulator-only (safe).
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 \
 *     npx tsx scripts/seedCondensationOptions.ts ca4L7sFEYUK4
 *
 * Optional: pass a second arg to override total option count.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error(
		'Refusing to run without FIRESTORE_EMULATOR_HOST set. This script is emulator-only.',
	);
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

// ----------------------------------------------------------------------
// Args
// ----------------------------------------------------------------------
const PARENT_ID = process.argv[2] ?? 'ca4L7sFEYUK4';
const TARGET_COUNT = Number(process.argv[3] ?? 200);
// Throttling — each write fires onStatementCreated, which synchronously
// calls OpenAI + runs credit/notification work. Writing too fast overwhelms
// the emulator's gRPC backend (DEADLINE_EXCEEDED). Batch size and inter-batch
// delay default to gentle values; override via argv[4], argv[5].
const BATCH_SIZE = Math.max(1, Number(process.argv[4] ?? 3));
const DELAY_MS = Math.max(0, Number(process.argv[5] ?? 1500));

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ----------------------------------------------------------------------
// 15 themes, ~13-14 variations each → ~200 options. Hebrew to match the
// existing question "שאלה 123". Each theme has a base phrase + a set of
// natural variations. Embeddings are synthetic (see below).
// ----------------------------------------------------------------------

interface Theme {
	slug: string;
	base: string;
	variants: string[];
}

// Theme set can be selected via env: SEED_THEMES=civic (default) | peace
const THEME_SET = (process.env.SEED_THEMES ?? 'civic').toLowerCase();

const peaceThemes: Theme[] = [
	{
		slug: 'economic-cooperation',
		base: 'שיתוף פעולה כלכלי אזורי',
		variants: [
			'נקים אזורי תעשייה משותפים',
			'נעודד מסחר חופשי בין הצדדים',
			'נפתח פרויקטים תשתיתיים משותפים',
			'נקדם תיירות דו-צדדית',
			'נשקיע בחקלאות משותפת באזורי הגבול',
			'נפתח פארק הייטק ישראלי-פלסטיני',
		],
	},
	{
		slug: 'education-and-youth',
		base: 'חינוך ומפגשי נוער',
		variants: [
			'נקיים תוכניות חילופי נוער',
			'נפתח בתי ספר משותפים לשלום',
			'נעודד לימודי שפה הדדיים (ערבית ועברית)',
			'נקדם תוכניות דיאלוג באוניברסיטאות',
			'נשלב היסטוריה משותפת בתוכניות לימוד',
			'נארגן מחנות קיץ משותפים',
		],
	},
	{
		slug: 'dialogue-diplomacy',
		base: 'דיאלוג ודיפלומטיה',
		variants: [
			'נחדש משא ומתן ישיר בין הצדדים',
			'נקדם ערוץ אחורי בלתי רשמי',
			'נשתף גורם מתווך ניטרלי בין-לאומי',
			'נקיים פסגות דו-שנתיות של המנהיגים',
			'נפתח שגרירויות לקשרי אנשים',
			'נארגן שולחנות עגולים בין-דתיים',
		],
	},
	{
		slug: 'security-arrangements',
		base: 'הסדרי ביטחון',
		variants: [
			'נקדם שיתוף פעולה בטחוני מוסדר',
			'נפרק נשק בלתי חוקי בהדרגה',
			'נפתח מוקדים משותפים למניעת טרור',
			'נקים ועדות מעקב משותפות להפרות',
			'ננהל אזורים מפורזים בפיקוח בינלאומי',
			'נחנך כוח משמר אזרחי משותף',
		],
	},
	{
		slug: 'civil-society',
		base: 'חברה אזרחית ותנועות שטח',
		variants: [
			'נתמוך בארגוני שלום ישראלים-פלסטינים',
			'נארגן מפגשי נשים משותפים',
			'נחזק את התנועה ההומניטרית',
			'נעניק מענקים לארגונים דו-צדדיים',
			'נקים פלטפורמה דיגיטלית לשיתוף פעולה',
			'נפתח מרחבי מפגש קהילתיים בשטח',
		],
	},
	{
		slug: 'cultural-exchange',
		base: 'חילופי תרבות',
		variants: [
			'נקיים פסטיבל תרבות משותף שנתי',
			'נעודד הפקות אמנות משותפות',
			'נקדם מוזיקאים ואמנים מכל הצדדים',
			'נארגן טיולים ומסעות משותפים',
			'נציג תערוכות במוזיאונים משותפים',
		],
	},
	{
		slug: 'humanitarian',
		base: 'שיפור חיי היומיום',
		variants: [
			'נפשט מעברי גבול לאזרחים',
			'נשפר גישה לשירותי בריאות בין האזורים',
			'נעצים שיתוף משאבי מים משותפים',
			'נסייע בבניית תשתיות מים וביוב משותפות',
			'נעצים תחבורה ציבורית חוצת גבול',
			'נקל על איחוד משפחות',
		],
	},
	{
		slug: 'international-mediation',
		base: 'תיווך בין-לאומי',
		variants: [
			'נזמין את האו״ם כגורם מתווך',
			'נפעיל ערוץ של המרובע (ארה״ב, רוסיה, או״ם, אירופה)',
			'נכנס מדינות ערב מתונות בתהליך',
			'נקדם ועידה בין-לאומית לשלום',
			'נבקש ערבויות בין-לאומיות להסכם',
		],
	},
];

const civicThemes: Theme[] = [
	{
		slug: 'parks',
		base: 'נגדיל את הפארקים העירוניים',
		variants: [
			'נוסיף פארקים חדשים בשכונות',
			'נשפר את הפארקים הקיימים',
			'נרחיב את השטחים הירוקים בעיר',
			'נשתיל עצים בפארקים',
			'נוסיף מתקני משחק בפארקים',
			'ניצור גינות קהילתיות חדשות',
			'נתחזק טוב יותר את הפארקים',
			'נוסיף ברזיות ומים בפארקים',
			'נאפשר שימוש לחיות מחמד בפארקים',
			'נשפר תאורה לילית בפארקים',
			'נארגן אירועי קהילה בפארקים',
			'נוסיף פינות צל בפארקים',
			'נוסיף שבילי ריצה בפארקים',
			'נציב פחי מיחזור בפארקים',
		],
	},
	{
		slug: 'bikes',
		base: 'נפתח רשת של שבילי אופניים',
		variants: [
			'נוסיף שבילי אופניים חדשים',
			'נחבר את שבילי האופניים הקיימים',
			'נצמיד שבילי אופניים לתחבורה ציבורית',
			'נוסיף חניות אופניים בכל השכונות',
			'ננגיש שבילי אופניים לילדים',
			'נוסיף תאורה בשבילי אופניים',
			'נשפר את סימוני שבילי האופניים',
			'נוסיף מפות של שבילי אופניים',
			'ניצור מסלולי אופניים חינוכיים',
			'נעודד רכיבה בטוחה עם קסדות',
			'נאכוף חוקי תנועה בשבילי אופניים',
			'נוסיף תחנות תיקון אופניים',
			'נארגן אירועי אופניים קהילתיים',
		],
	},
	{
		slug: 'transit',
		base: 'נשפר את התחבורה הציבורית',
		variants: [
			'נגדיל את תדירות האוטובוסים',
			'נוסיף קווי אוטובוס חדשים',
			'נפתח קווי אוטובוס לילה',
			'נוזיל כרטיסי תחבורה ציבורית',
			'נעדכן את תחנות האוטובוסים',
			'נוסיף תחנות עם גג ומושבים',
			'נקדם נסיעות חינם לקשישים',
			'נחבר שכונות לא מחוברות לתחבורה',
			'נוסיף לוחות זמנים בזמן אמת',
			'נשפר נגישות לנכים בתחבורה',
			'נפתח קווי רכבת עירוניים',
			'נרחיב את שעות הפעילות של התחבורה',
		],
	},
	{
		slug: 'events',
		base: 'נארגן יותר אירועים קהילתיים',
		variants: [
			'נארגן פסטיבלי רחוב עירוניים',
			'נוסיף מופעי מוזיקה חינם',
			'נפעיל שווקי איכרים',
			'נארגן ימי ספורט קהילתיים',
			'נקיים מפגשי שכונה חודשיים',
			'נארגן אירועי אמנות ברחוב',
			'נעודד פעילויות קהילה בחורף',
			'נקיים ערבי שירה בפארקים',
			'נארגן פיקניקים קהילתיים',
			'נארגן אירועים לילדים ברחובות',
			'נקיים אירועי בישול קהילתיים',
		],
	},
	{
		slug: 'seniors',
		base: 'נחזק שירותים לגיל השלישי',
		variants: [
			'נוסיף מרכזי קשישים בשכונות',
			'נפתח מועדוני פעילות יומית לקשישים',
			'נקדם תוכניות ליווי קשישים בבית',
			'נארגן שיעורים לקשישים',
			'נשפר את הנגישות למבנים ציבוריים לקשישים',
			'נפעיל אוטובוסי שירות לקשישים',
			'נארגן פעילות פנאי לקשישים',
			'ניצור תוכניות מתנדבים עם קשישים',
			'נוסיף פעילויות ספורט מותאמות לקשישים',
			'נפתח מרפאות קהילתיות לקשישים',
			'נקדם שירותי בריאות מונעת לקשישים',
			'נארגן טיולי קהילה לקשישים',
		],
	},
	{
		slug: 'youth',
		base: 'נשקיע בתוכניות לנוער',
		variants: [
			'נפתח מרכזי נוער בכל שכונה',
			'נמשיך תוכניות אחרי בית ספר',
			'נעודד מנהיגות צעירה',
			'נקיים סדנאות יצירה לנוער',
			'נוסיף ליגות ספורט לנוער',
			'נארגן סיוע לימודי לנוער',
			'נקדם תעסוקה לנוער',
			'נארגן טיולים חינוכיים לנוער',
			'נפתח חללי עבודה משותפים לסטודנטים',
			'נוסיף תוכניות אמנות לנוער',
			'נפעיל קייטנות קיץ לנוער',
			'ניצור תוכניות התנדבות לנוער',
			'נקיים תחרויות מדע לנוער',
		],
	},
	{
		slug: 'lighting',
		base: 'נשפר תאורת רחובות',
		variants: [
			'נחליף נורות רחוב לחסכוניות',
			'נוסיף תאורה חכמה בכבישים',
			'נעצים תאורה בשכונות חשוכות',
			'נוסיף תאורה בשבילים הציבוריים',
			'נחליף עמודי תאורה ישנים',
			'נוסיף תאורה סולארית',
			'נחזק תאורה במעברי חצייה',
			'נוסיף תאורה בגני משחקים',
			'נסיר מפגעי תאורה כבויה',
			'נוסיף תאורה במוקדי פשיעה',
			'נעצים תאורה במעברים חשוכים',
			'נחליף תאורת פארקים ללד',
		],
	},
	{
		slug: 'waste',
		base: 'נשפר את ניהול הפסולת',
		variants: [
			'נגדיל את מספר פחי המיחזור',
			'נכניס פינוי אשפה מתקדם',
			'נעודד קומפוסטציה ביתית',
			'נקדם הפחתת שימוש בפלסטיק',
			'נארגן ימי ניקיון קהילתיים',
			'נוסיף פחים ברחובות ראשיים',
			'נקדם מיון פסולת אורגנית',
			'נפתח תחנות איסוף פסולת אלקטרונית',
			'נעודד חנויות ללא אריזות',
			'נעצים את פינויי הזבל התכופים',
			'נחנך קמפיינים נגד השלכת פסולת',
			'נפעיל פחים חכמים',
		],
	},
	{
		slug: 'air',
		base: 'נפעל לשיפור איכות האוויר',
		variants: [
			'נוסיף תחנות מדידת זיהום אוויר',
			'נעודד מעבר לרכבים חשמליים',
			'נוסיף אזורי פליטה נמוכה',
			'נשתיל עצים לסינון אוויר',
			'נעצים אכיפה על פליטות תעשייה',
			'נקדם עבודה מהבית',
			'נסבסד אופניים חשמליים',
			'נשקיע ברכבת עירונית',
			'נוסיף מסלולי תחבורה ציבורית מהירה',
			'נקדם מבנים ירוקים',
			'נעודד שימוש באנרגיה סולארית',
		],
	},
	{
		slug: 'business',
		base: 'נתמוך בעסקים מקומיים',
		variants: [
			'נוזיל מיסוי לעסקים קטנים',
			'נארגן מרכזי קניות קהילתיים',
			'נפתח חללי עבודה משותפים',
			'נעודד קניית מוצרים מקומיים',
			'נפרסם עסקים מקומיים בערוצים דיגיטליים',
			'נוריד אגרות לעסקים צעירים',
			'נארגן ימי עסקים פתוחים',
			'נפתח דוכני רחוב בעונה',
			'נציג מדריך עסקים מקומיים',
			'נקדם סיוע לעסקים בתקופת משבר',
			'נפעיל קורסי יזמות לתושבים',
			'נעצים אזורי מסחר ציבוריים',
		],
	},
	{
		slug: 'schools',
		base: 'נחזק את מערכת החינוך',
		variants: [
			'נוסיף תקציב לבתי ספר',
			'נקדם שיפוצים בבתי הספר',
			'ננפיק ציוד לימודי חדש',
			'נעצים הכשרות למורים',
			'נוסיף פסיכולוגים בבתי ספר',
			'נפתח תוכניות סיוע לתלמידים',
			'נפתח כיתות טכנולוגיה מתקדמות',
			'נחזק חינוך מיני והגנה',
			'נצמצם את גודל הכיתות',
			'נוסיף שיעורי חוץ בית ספריים',
			'נקדם תוכניות חילופי תלמידים',
			'נעודד שיתוף הורים בחינוך',
		],
	},
	{
		slug: 'safety',
		base: 'נשפר את תחושת הביטחון בעיר',
		variants: [
			'נוסיף סיורי שיטור קהילתי',
			'נתקין מצלמות אבטחה בצמתים',
			'נעצים תאורה במוקדי פשיעה',
			'נקדם הדרכות הגנה עצמית',
			'ניצור שומרי שכונה מתנדבים',
			'נאכוף חוקי תעבורה',
			'נעצים אבטחה בגני ילדים',
			'נקים מוקד חירום 24/7',
			'נקדם מניעת אלימות בקהילה',
			'נפעיל תוכניות שיקום לנוער בסיכון',
			'נעצים את הנוכחות המשטרתית בלילה',
		],
	},
	{
		slug: 'housing',
		base: 'נשקיע בדיור בהישג יד',
		variants: [
			'נבנה דירות להשכרה במחיר מפוקח',
			'נעצים סבסוד שכר דירה לאוכלוסיות חלשות',
			'נרחיב דיור ציבורי',
			'נקדם תוכניות לצעירים רוכשי דירה ראשונה',
			'נעודד בנייה מוגנת מסביבה',
			'נפתח תוכניות לצמצום מחסור בדיור',
			'נקדם שיפוץ בניינים ישנים',
			'ניצור דיור סטודנטים בקמפוסים',
			'נעצים מניעת פינויי דיור',
			'נבנה דיור לקשישים חסרי משאבים',
			'נעצים אכיפה על דירות לא חוקיות',
		],
	},
	{
		slug: 'accessibility',
		base: 'נשפר את הנגישות לנכים',
		variants: [
			'נוסיף רמפות בכל מבני הציבור',
			'נוסיף שילוט ברייל במרחב הציבורי',
			'נעצים אוטובוסים נגישים',
			'נעצים הליכה נגישה על מדרכות',
			'נקים תוכניות תעסוקה לנכים',
			'נעצים ילדים עם מוגבלויות בבתי ספר',
			'נוסיף מעליות בתחנות רכבת',
			'ננגיש אתרי תרבות לכבדי שמיעה',
			'נפתח חופים נגישים',
			'נעצים נגישות בגני משחקים',
			'נוסיף תרגום בשפת סימנים באירועים',
		],
	},
	{
		slug: 'culture',
		base: 'נעצים חיי תרבות בעיר',
		variants: [
			'נפתח מרכזי תרבות שכונתיים',
			'נעצים ספריות ציבוריות',
			'נארגן פסטיבל סרטים שנתי',
			'נתמוך ביוצרים מקומיים',
			'נוסיף אמנות ציבורית ברחובות',
			'נקיים סיורי תרבות חינם',
			'ניצור מוזיאון עירוני חדש',
			'נסבסד כרטיסי תיאטרון לצעירים',
			'נקדם תוכניות תרבות במוסדות חינוך',
			'נעצים אמנות רחוב מוסדרת',
			'נפעיל מופעי רחוב קבועים',
			'נפתח קורסי אמנות לכל הגילאים',
			'נעצים את התרבות הכפרית באזור',
		],
	},
];

const themes: Theme[] = THEME_SET === 'peace' ? peaceThemes : civicThemes;

// ----------------------------------------------------------------------
// Synthetic embeddings — deterministic per theme.
//   Each theme gets a unit vector in a random 1536-d direction (seeded).
//   Each option in the theme = base + small random noise, renormalized.
//   Cosine(option_A, option_B) within a theme ≈ 0.99  (well above "tight" 0.92)
//   Cosine across themes ≈ ~0                          (well below "loose" 0.75)
// ----------------------------------------------------------------------
const DIM = 1536;

function mulberry32(seed: number): () => number {
	let t = seed >>> 0;

	return function () {
		t = (t + 0x6d2b79f5) >>> 0;
		let r = t;
		r = Math.imul(r ^ (r >>> 15), r | 1);
		r ^= r + Math.imul(r ^ (r >>> 7), r | 61);

		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

function unitVector(rng: () => number, dim: number): number[] {
	const v: number[] = new Array(dim);
	let norm = 0;
	for (let i = 0; i < dim; i++) {
		// Box-Muller for gaussian-ish noise → isotropic unit vector after normalization
		const u1 = Math.max(rng(), 1e-10);
		const u2 = rng();
		const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
		v[i] = g;
		norm += g * g;
	}
	norm = Math.sqrt(norm);
	for (let i = 0; i < dim; i++) v[i] /= norm;

	return v;
}

function perturb(base: number[], rng: () => number, magnitude = 0.08): number[] {
	const out: number[] = new Array(base.length);
	let norm = 0;
	for (let i = 0; i < base.length; i++) {
		const jitter = (rng() - 0.5) * 2 * magnitude;
		const x = base[i] + jitter;
		out[i] = x;
		norm += x * x;
	}
	norm = Math.sqrt(norm);
	for (let i = 0; i < out.length; i++) out[i] /= norm;

	return out;
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------
async function main(): Promise<void> {
	const parentDoc = await db.collection('statements').doc(PARENT_ID).get();
	if (!parentDoc.exists) {
		console.error(`Parent statement ${PARENT_ID} not found in emulator`);
		process.exit(1);
	}
	const parent = parentDoc.data()!;
	const topParentId = parent.topParentId ?? PARENT_ID;

	// Build the full list of (theme, text) pairs, cycle through themes to
	// reach TARGET_COUNT.
	const plan: Array<{ themeIdx: number; text: string }> = [];
	let themeIdx = 0;
	let variantIdx = 0;
	while (plan.length < TARGET_COUNT) {
		const theme = themes[themeIdx];
		const base = theme.variants[variantIdx % theme.variants.length];
		// Occasional numeric suffix keeps entries unique if we wrap around.
		const suffix = plan.length >= themes.length * 10 ? ` (#${plan.length})` : '';
		plan.push({ themeIdx, text: `${base}${suffix}` });
		themeIdx = (themeIdx + 1) % themes.length;
		if (themeIdx === 0) variantIdx++;
	}

	// Precompute theme base embeddings once.
	const themeBases: number[][] = themes.map((_, i) => unitVector(mulberry32(0xc0ffee + i), DIM));
	const nowBase = Date.now();

	const creator = {
		uid: parent.creatorId ?? 'seed-bot',
		displayName: 'Seed Bot',
		email: null,
		photoURL: null,
		isAnonymous: false,
	};

	let written = 0;
	for (let start = 0; start < plan.length; start += BATCH_SIZE) {
		const chunk = plan.slice(start, start + BATCH_SIZE);
		const batch = db.batch();
		for (let i = 0; i < chunk.length; i++) {
			const { themeIdx: ti, text } = chunk[i];
			const statementId = randomUUID().replace(/-/g, '').slice(0, 20);
			const rng = mulberry32(0xdeadbeef + start + i);
			const embedding = perturb(themeBases[ti], rng, 0.08);
			const createdAt = nowBase + start + i; // stable ordering

			const ref = db.collection('statements').doc(statementId);
			batch.set(ref, {
				statementId,
				statement: text,
				description: '',
				statementType: 'option',
				parentId: PARENT_ID,
				topParentId,
				parents: [topParentId],
				creatorId: creator.uid,
				creator,
				createdAt,
				lastUpdate: createdAt,
				consensus: 0,
				// embeddings required by the condensation pipeline. Firestore
				// canonical shape is VectorValue (so findNearest works); the
				// trigger may overwrite with OpenAI's, that's fine.
				embedding: FieldValue.vector(embedding),
				embeddingModel: 'seed-synthetic-v1',
				embeddingCreatedAt: createdAt,
				// basic evaluation so the UI doesn't complain. Include
				// evaluationRandomNumber + viewed so the main evaluation updater
				// (statementEvaluationUpdater.ts) can safely overwrite the object
				// via dot-notation updates — Firestore rejects undefined values.
				evaluation: {
					sumEvaluations: 0,
					agreement: 0,
					numberOfEvaluators: 0,
					sumPro: 0,
					sumCon: 0,
					numberOfProEvaluators: 0,
					numberOfConEvaluators: 0,
					sumSquaredEvaluations: 0,
					averageEvaluation: 0,
					evaluationRandomNumber: Math.random(),
					viewed: 0,
				},
			});
		}
		await batch.commit();
		written += chunk.length;
		console.info(`Wrote ${written}/${plan.length}`);
		// Pause so onStatementCreated triggers can drain (OpenAI calls, etc.)
		if (written < plan.length && DELAY_MS > 0) {
			await sleep(DELAY_MS);
		}
	}

	// Bump parent's lastChildUpdate so the UI refreshes.
	await db.collection('statements').doc(PARENT_ID).update({
		lastChildUpdate: Date.now(),
		lastUpdate: Date.now(),
	}).catch(() => undefined);

	console.info(`Done. Seeded ${written} options under ${PARENT_ID} across ${themes.length} themes.`);
	console.info('Next: open the question, enable Grouping in AI & Automation settings, click "Group now".');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

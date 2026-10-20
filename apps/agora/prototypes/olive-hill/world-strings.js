/**
 * Every word the 3D world paints or shows, in one place.
 *
 * The world is a page in an iframe and cannot call the app's t(). In a lesson
 * the shell sends these resolved, in the student's language, on every
 * `agora-village-state` (`strings`); the Hebrew below is only the standalone
 * tour's fallback. A key the shell does not send keeps its fallback, and an
 * unknown key is ignored, so neither side can break the other.
 *
 * Address is plural and gender-neutral, like the rest of the app. The app's
 * side of the list is `lib/flows/villageWorldStrings.ts`; a test pins that
 * the two name the same keys.
 */
export const S = {
	dir: 'rtl',
	lang: 'he',
	// The guide's bubble at the booth's table
	bubble_written: 'הפתק כבר על הלוח. אפשר לחזור אליו ולשפר אותו.',
	bubble_pending: 'הפתק עוד בדרך ללוח.',
	bubble_closed_written: 'הכתיבה כאן נסגרה. הפתק נשאר על הלוח, ואפשר לפתוח ולקרוא אותו.',
	bubble_closed_empty: 'הכתיבה כאן נסגרה. אפשר לקרוא את הפתקים של הכיתה על הלוח.',
	btn_write: '✍️ לכתוב על הפתק שלי',
	btn_edit: '✍️ לערוך את הפתק שלי',
	btn_read: '📖 לקרוא את הפתק שלי',
	// The paper on the desk
	note_mine: 'הפתק שלי',
	note_n: 'פתק {{n}}',
	paper_waiting: 'הפתק מחכה כאן…',
	paper_idle: 'כאן יחכה פתק כשהשאלה תיפתח',
	// The class board on the booth's back wall
	board_title: 'הפתקים של הכיתה',
	board_locked: 'הביתן עדיין סגור',
	board_locked_hint: 'ייפתח כשהמורה יגיע לשאלה הזאת',
	board_empty: 'הפתקים שתכתבו כאן יופיעו על הלוח',
	board_more: 'ועוד {{n}} פתקים בכפתור „כל הפתקים“',
	board_more_one: 'ועוד פתק אחד בכפתור „כל הפתקים“',
	sign_later: 'ייפתח בהמשך המפגש',
	// What each kind of booth is for: its sign and the line beside the map
	kind_story_name: 'ביתן הסיפורים',
	kind_story_prompt: 'כותבים סיפור אישי על הפתק שעל השולחן, וקוראים את הסיפורים של החברים על הלוח.',
	kind_needs_name: 'ביתן הצרכים',
	kind_needs_prompt: 'כותבים מה חשוב לכם, ומסמנים על הלוח עד כמה הצרכים של החברים חשובים גם לכם.',
	kind_vision_name: 'ביתן החזון',
	kind_vision_prompt: 'כותבים איך הייתם רוצים שזה ייראה, ומסמנים על הלוח עד כמה גם אתם רוצים את החזון של החברים.',
	kind_open_name: 'ביתן השאלה',
	kind_open_prompt: 'כותבים את התשובה שלכם על הפתק, ומדרגים על הלוח את התשובות של החברים.',
	kind_proposal_name: 'ביתן ההצעות',
	kind_proposal_prompt: 'כותבים הצעה, מדרגים את ההצעות של החברים על הלוח ומציעים להם שיפורים.',
	// The three fixed places
	place_library_name: 'הספרייה',
	place_library_short: 'לומדים יחד',
	place_library_question: 'פותחים ספר ומגלים את הסיפור, הדמויות והצרכים.',
	place_challenge_name: 'בית המדרש',
	place_challenge_short: 'האתגר',
	place_challenge_question: 'מה אנחנו יודעים, ומה עוד חשוב לברר?',
	place_council_name: 'מועצת הכפר',
	place_council_short: 'מחליטים יחד',
	place_council_question: 'על הלוח הגדול: כל ההצעות במגרש, השער, ובזמן ההצבעה — הקלפי.',
	// The map, the walk and the controls
	map_toggle: '🗺 מפת הכפר',
	map_lead: 'מסתובבים בחופשיות. כשהמורה עובר לביתן חדש, כולם הולכים אליו יחד.',
	map_free: 'בחרו לאן ללכת. ביתן נפתח כשהמורה מגיע אליו.',
	class_at: 'הכיתה נמצאת ב: {{place}}',
	badge_locked: '🔒 בהמשך',
	badge_here: '● הכיתה כאן',
	badge_results: 'לוח התוצאות',
	badge_open: '✓ פתוח',
	enter_desk: 'לגשת לשולחן ולפתק',
	enter_results: 'לפתוח את לוח התוצאות',
	enter_booth: 'לגשת לביתן הזה',
	enter_place: 'להיכנס ←',
	enter_place_far: 'ללכת לשם ולהיכנס ←',
	walk_to: 'ללכת אל: {{place}}',
	stop: 'לעצור',
	hint: 'W A S D הליכה · גרירה להסתכלות · E כניסה',
};

/** Bumped on every change, so a canvas painted with the old words repaints */
export let stringsVersion = 0;

/** Take the shell's words. Only known keys with string values; true when anything changed. */
export function setStrings(next) {
	if (!next || typeof next !== 'object') return false;
	let changed = false;
	for (const key of Object.keys(S)) {
		const value = next[key];
		if (typeof value === 'string' && value && S[key] !== value) {
			S[key] = value;
			changed = true;
		}
	}
	if (changed) stringsVersion++;

	return changed;
}

/** `{{name}}` placeholders, the app's own interpolation */
export function fill(template, vars = {}) {
	return Object.entries(vars).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), template);
}

/** The board's "N more" line, singular when there is one */
export function moreLine(n) {
	return n === 1 ? S.board_more_one : fill(S.board_more, { n });
}

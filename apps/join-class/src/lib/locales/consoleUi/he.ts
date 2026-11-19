// he strings of the teacher console redesign (one next button, quiet screen, decision panel). Spread into ../he.ts.

const consoleUi: Record<string, string> = {
	'console.step.waiting': 'התלמידים נכנסים',
	'console.settings_scope': 'חל רק על השיעור הזה',
	'console.blocked.no_students': 'עוד אין תלמידים לחלק',
	'console.blocked.no_proposals': 'אין עדיין הצעות להצבעה',
	'console.busy_closing': 'סוגרים…',
	'console.busy_showing': 'מציגים…',
	'console.busy_splitting': 'מחלקים…',
	'console.busy_copying': 'מביאים…',
	'console.close_vote_title': '{{n}} עוד לא הצביעו. לסגור את ההצבעה?',
	'console.close_vote_yes': 'לסגור',
	'console.vote_skip': 'לעבור לסיכום בלי הצבעה',
	'console.vote_skip_title': 'ההצבעה לא נפתחה. לעבור לסיכום בלי הצבעה?',
	'console.vote_skip_body': 'בסיכום תוצג ההצעה שהכי הסכימו עליה.',
	'console.vote_skip_yes': 'לעבור לסיכום',
	'console.resplit_title': 'לחלק מחדש את הכיתה?',
	'console.resplit_body': 'הישיבה הנוכחית תימחק, ואי אפשר להחזיר אותה.',
	'console.all_steps': 'כל השלבים',
	'console.step_now': 'עכשיו',
	'console.step_back_hint': 'לחזור לשלב הזה',
	'console.step_back_tag': 'לחזור',
	'console.steps_forward_note': 'לשלב הבא עוברים רק בכפתור הגדול, שלב אחרי שלב.',
	'console.next_action_label': 'הפעולה הבאה',
};

export default consoleUi;

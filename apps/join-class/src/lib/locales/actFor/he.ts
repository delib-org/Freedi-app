// Hebrew strings of the proposal limit and of acting for a student without a device.
// Spread into ../he.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'כמה הצעות לכל אחד',
	'console.proposal_limit_one': 'אחת',
	'console.proposal_limit_unlimited': 'ללא הגבלה',
	'console.proposal_limit_help':
		'חזרה לאחת לא מוחקת כלום: הצעות שכבר נשלחו נשארות, ומי שיש לו הצעה לא יכול להוסיף עוד',
	'proposal.limit_reached': 'אפשר לשלוח הצעה אחת',
	'console.propose_for': 'להציע בשם {{name}}',
	'console.vote_for': 'להצביע בשם {{name}}',
	'console.save_for': 'לשמור בשם {{name}}',
	'console.entered_by_teacher': 'הוזן על ידי המורה',
	'console.proposal_sent_for': 'ההצעה בשם {{name}} נשלחה',
	'console.proposal_saved_for': 'ההצעה בשם {{name}} נשמרה',
	'console.vote_counted_for': 'ההצבעה של {{name}} נקלטה',
	'console.act_for_next': 'הבא: {{name}}',
	'console.act_for_limit': 'כבר יש הצעה בשם {{name}}. אפשר לערוך אותה',
	'console.act_for_closed': 'ההצבעה נפתחה: אי אפשר עוד לשנות הצעות',
	'console.act_for_held': 'השיעור עצור: כרגע אי אפשר לשנות כלום',
	'console.act_for_vote_not_open': 'ההצבעה עוד לא נפתחה',
	'console.act_for_empty': 'עדיין אין כאן אף אחד בלי מכשיר. אפשר להוסיף',
	'console.act_for_pick': 'בחרו שם מהרשימה',
	'console.act_for_done': 'בוצע',
	'console.act_for_not_done': 'עוד לא בוצע',
	'console.act_for_table': 'שולחן',
	'console.act_for_text': 'ההצעה',
};

export default actFor;

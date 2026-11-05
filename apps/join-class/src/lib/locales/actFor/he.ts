// Hebrew strings of the proposal limit and of acting for a student without a device.
// Spread into ../he.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'כמה הצעות לכל אחד',
	'console.proposal_limit_one': 'אחת',
	'console.proposal_limit_unlimited': 'ללא הגבלה',
	'console.proposal_limit_help':
		'חזרה לאחת לא מוחקת כלום: הצעות שכבר נשלחו נשארות, ומי שיש לו הצעה לא יכול להוסיף עוד',
	'proposal.limit_reached': 'אפשר לשלוח הצעה אחת',
};

export default actFor;

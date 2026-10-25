// Hebrew strings of the vote: the student's ballot screen (voting.*) and
// the teacher's vote controls (console.*_vote). Spread into ../he.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const vote: Record<string, string> = {
	'console.open_vote': 'פתיחת ההצבעה',
	'console.pause_vote': 'השהיית ההצבעה',
	'console.resume_vote': 'המשך ההצבעה',
	'console.close_vote': 'סגירת ההצבעה',
	'voting.title': 'הצבעה',
	'voting.pick_one': 'בחרו הצעה אחת',
	'voting.waiting': 'ממתינים שהמורה תפתח את ההצבעה',
	'voting.empty': 'אין מה להצביע',
	'voting.vote': 'הצבעה',
	'voting.voted': 'הצבעתם',
	'voting.change': 'לשנות הצבעה',
	'voting.saving': 'שומרים…',
	'voting.closed': 'ההצבעה נסגרה',
	'voting.failed': 'ההצבעה לא נשמרה. לנסות שוב',
	'voting.paused': 'ההצבעה מושהית',
	'voting.paused_hint': 'המורה עצרה את ההצבעה לרגע. ההצבעה שלכם נשמרה.',
};

export default vote;

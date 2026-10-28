// Hebrew strings of "כל ההצעות" (IA 19): the phone's board (allProposals.*),
// the console lines and the projector title. Spread into ../he.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const allProposals: Record<string, string> = {
	'step.allProposals': 'כל ההצעות',
	'allProposals.instruction': 'דרגו כל הצעה',
	'allProposals.new_n': '{{n}} הצעות חדשות',
	'allProposals.new_one': 'הצעה חדשה',
	'allProposals.progress': 'דירגתם {{n}} מתוך {{m}}',
	'allProposals.done': 'דירגתם את כל ההצעות. חכו למורה',
	'allProposals.more': 'עוד {{n}} הצעות',
	'allProposals.seen_all': 'ראיתם את כל ההצעות',
	'allProposals.write_mine': '+ הצעה משלי',
	'console.all_rated_line': '{{n}} מתוך {{m}} תלמידים דירגו הכול · לכל הצעה לפחות {{k}} דירוגים',
	'console.table_rated_all': '{{n}}/{{m}} דירגו הכול',
	'projector.allProposals': 'כל ההצעות · {{n}} הצעות',
	'projector.allProposals_min': 'לכל הצעה לפחות {{k}} דירוגים',
};

export default allProposals;

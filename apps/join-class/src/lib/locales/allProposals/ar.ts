// Arabic strings of "כל ההצעות" (IA 19): the phone's board (allProposals.*),
// the console lines and the projector title. Spread into ../ar.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const allProposals: Record<string, string> = {
	'step.allProposals': 'كل الاقتراحات',
	'allProposals.instruction': 'قيّموا كل اقتراح',
	'allProposals.new_n': '{{n}} اقتراحات جديدة',
	'allProposals.new_one': 'اقتراح جديد',
	'allProposals.progress': 'قيّمتم {{n}} من {{m}}',
	'allProposals.done': 'قيّمتم كل الاقتراحات. انتظروا المعلم',
	'allProposals.more': 'عرض {{n}} اقتراحات أخرى',
	'allProposals.seen_all': 'رأيتم كل الاقتراحات',
	'allProposals.write_mine': '+ اقتراحي',
	'console.all_rated_line':
		'{{n}} من {{m}} طلاب قيّموا كل شيء · لكل اقتراح {{k}} تقييمات على الأقل',
	'console.table_rated_all': '{{n}}/{{m}} قيّموا كل شيء',
	'projector.allProposals': 'كل الاقتراحات · {{n}} اقتراحات',
	'projector.allProposals_min': 'لكل اقتراح {{k}} تقييمات على الأقل',
};

export default allProposals;

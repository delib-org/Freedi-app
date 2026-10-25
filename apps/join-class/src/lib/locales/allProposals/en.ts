// English strings of "כל ההצעות" (IA 19): the phone's board (allProposals.*),
// the console lines and the projector title. Spread into ../en.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const allProposals: Record<string, string> = {
	'step.allProposals': 'All proposals',
	'allProposals.instruction': 'Rate each proposal',
	'allProposals.new_n': '{{n}} new proposals',
	'allProposals.new_one': 'One new proposal',
	'allProposals.progress': 'You rated {{n}} of {{m}}',
	'allProposals.done': 'You rated every proposal. Wait for the teacher',
	'allProposals.write_mine': '+ My own proposal',
	'console.all_rated_line':
		'{{n}} of {{m}} students rated everything · every proposal has at least {{k}} ratings',
	'console.table_rated_all': '{{n}}/{{m}} rated everything',
	'projector.allProposals': 'All proposals · {{n}} proposals',
	'projector.allProposals_min': 'Every proposal has at least {{k}} ratings',
};

export default allProposals;

// Spanish strings of "כל ההצעות" (IA 19): the phone's board (allProposals.*),
// the console lines and the projector title. Spread into ../es.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const allProposals: Record<string, string> = {
	'step.allProposals': 'Todas las propuestas',
	'allProposals.instruction': 'Valorad cada propuesta',
	'allProposals.new_n': '{{n}} propuestas nuevas',
	'allProposals.new_one': 'Una propuesta nueva',
	'allProposals.progress': 'Habéis valorado {{n}} de {{m}}',
	'allProposals.done': 'Habéis valorado todas las propuestas. Esperad al profesor',
	'allProposals.more': 'Ver {{n}} más',
	'allProposals.seen_all': 'Habéis visto todas las propuestas',
	'allProposals.write_mine': '+ Mi propia propuesta',
	'console.all_rated_line':
		'{{n}} de {{m}} estudiantes lo valoraron todo · cada propuesta tiene al menos {{k}} valoraciones',
	'console.table_rated_all': '{{n}}/{{m}} lo valoraron todo',
	'projector.allProposals': 'Todas las propuestas · {{n}} propuestas',
	'projector.allProposals_min': 'Cada propuesta tiene al menos {{k}} valoraciones',
};

export default allProposals;

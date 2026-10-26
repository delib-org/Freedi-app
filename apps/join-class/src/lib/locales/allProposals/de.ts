// German strings of "כל ההצעות" (IA 19): the phone's board (allProposals.*),
// the console lines and the projector title. Spread into ../de.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const allProposals: Record<string, string> = {
	'step.allProposals': 'Alle Vorschläge',
	'allProposals.instruction': 'Bewertet jeden Vorschlag',
	'allProposals.new_n': '{{n}} neue Vorschläge',
	'allProposals.new_one': 'Ein neuer Vorschlag',
	'allProposals.progress': 'Ihr habt {{n}} von {{m}} bewertet',
	'allProposals.done': 'Ihr habt alle Vorschläge bewertet. Wartet auf die Lehrkraft',
	'allProposals.write_mine': '+ Mein eigener Vorschlag',
	'console.all_rated_line':
		'{{n}} von {{m}} Schülern haben alles bewertet · jeder Vorschlag hat mindestens {{k}} Bewertungen',
	'console.table_rated_all': '{{n}}/{{m}} haben alles bewertet',
	'projector.allProposals': 'Alle Vorschläge · {{n}} Vorschläge',
	'projector.allProposals_min': 'Jeder Vorschlag hat mindestens {{k}} Bewertungen',
};

export default allProposals;

// Dutch strings of "כל ההצעות" (IA 19): the phone's board (allProposals.*),
// the console lines and the projector title. Spread into ../nl.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const allProposals: Record<string, string> = {
	'step.allProposals': 'Alle voorstellen',
	'allProposals.instruction': 'Beoordeel elk voorstel',
	'allProposals.new_n': '{{n}} nieuwe voorstellen',
	'allProposals.new_one': 'Eén nieuw voorstel',
	'allProposals.progress': 'Je hebt {{n}} van {{m}} beoordeeld',
	'allProposals.done': 'Je hebt alle voorstellen beoordeeld. Wacht op de leraar',
	'allProposals.more': 'Toon nog {{n}}',
	'allProposals.seen_all': 'Je hebt alle voorstellen gezien',
	'allProposals.write_mine': '+ Mijn eigen voorstel',
	'console.all_rated_line':
		'{{n}} van {{m}} leerlingen hebben alles beoordeeld · elk voorstel heeft minstens {{k}} beoordelingen',
	'console.table_rated_all': '{{n}}/{{m}} hebben alles beoordeeld',
	'projector.allProposals': 'Alle voorstellen · {{n}} voorstellen',
	'projector.allProposals_min': 'Elk voorstel heeft minstens {{k}} beoordelingen',
	'console.all_rated_line_one':
		'{{n}} van {{m}} leerlingen hebben alles beoordeeld · elk voorstel heeft minstens 1 beoordeling',
	'projector.allProposals_min_one': 'Elk voorstel heeft minstens 1 beoordeling',
	'console.all_rated_line_solo':
		'{{n}} van 1 leerling heeft alles beoordeeld · elk voorstel heeft minstens {{k}} beoordelingen',
	'console.all_rated_line_solo_one':
		'{{n}} van 1 leerling heeft alles beoordeeld · elk voorstel heeft minstens 1 beoordeling',
};

export default allProposals;

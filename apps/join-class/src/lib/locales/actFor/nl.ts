// Dutch strings of the proposal limit and of acting for a student without a device.
// Spread into ../nl.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'Voorstellen per persoon',
	'console.proposal_limit_one': 'Eén',
	'console.proposal_limit_unlimited': 'Onbeperkt',
	'console.proposal_limit_help':
		'Terug naar één verwijdert niets: verstuurde voorstellen blijven staan, en wie er al een heeft kan er geen toevoegen',
	'proposal.limit_reached': 'Je kunt één voorstel sturen',
	'console.propose_for': 'Voorstellen namens {{name}}',
	'console.vote_for': 'Stemmen namens {{name}}',
	'console.save_for': 'Opslaan namens {{name}}',
	'console.entered_by_teacher': 'Ingevoerd door de leraar',
	'console.proposal_sent_for': 'Het voorstel namens {{name}} is verstuurd',
	'console.proposal_saved_for': 'Het voorstel namens {{name}} is opgeslagen',
	'console.vote_counted_for': 'De stem van {{name}} is geteld',
	'console.act_for_next': 'Volgende: {{name}}',
	'console.act_for_limit': 'Er is al een voorstel namens {{name}}. Dat kan worden bewerkt',
	'console.act_for_closed': 'De stemming is geopend: voorstellen kunnen niet meer veranderen',
	'console.act_for_held': 'De les staat stil: er kan nu niets veranderen',
	'console.act_for_vote_not_open': 'De stemming is nog niet geopend',
	'console.act_for_empty': 'Nog niemand zonder apparaat. Je kunt iemand toevoegen',
	'console.act_for_pick': 'Kies een naam uit de lijst',
	'console.act_for_done': 'klaar',
	'console.act_for_not_done': 'nog niet klaar',
	'console.act_for_table': 'Tafel',
	'console.act_for_text': 'Het voorstel',
};

export default actFor;

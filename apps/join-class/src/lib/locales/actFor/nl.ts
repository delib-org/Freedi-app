// Dutch strings of the proposal limit and of acting for a student without a device.
// Spread into ../nl.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'Voorstellen per persoon',
	'console.proposal_limit_one': 'Eén',
	'console.proposal_limit_unlimited': 'Onbeperkt',
	'console.proposal_limit_help':
		'Terug naar één verwijdert niets: verstuurde voorstellen blijven staan, en wie er al een heeft kan er geen toevoegen',
	'proposal.limit_reached': 'Je kunt één voorstel sturen',
};

export default actFor;

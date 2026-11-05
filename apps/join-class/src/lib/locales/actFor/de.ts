// German strings of the proposal limit and of acting for a student without a device.
// Spread into ../de.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'Vorschläge pro Person',
	'console.proposal_limit_one': 'Einer',
	'console.proposal_limit_unlimited': 'Unbegrenzt',
	'console.proposal_limit_help':
		'Zurück auf einen Vorschlag löscht nichts: Gesendete Vorschläge bleiben, und wer schon einen hat, kann keinen weiteren hinzufügen',
	'proposal.limit_reached': 'Du kannst einen Vorschlag senden',
};

export default actFor;

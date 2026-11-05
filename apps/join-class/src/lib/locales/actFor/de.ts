// German strings of the proposal limit and of acting for a student without a device.
// Spread into ../de.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'Vorschläge pro Person',
	'console.proposal_limit_one': 'Einer',
	'console.proposal_limit_unlimited': 'Unbegrenzt',
	'console.proposal_limit_help':
		'Zurück auf einen Vorschlag löscht nichts: Gesendete Vorschläge bleiben, und wer schon einen hat, kann keinen weiteren hinzufügen',
	'proposal.limit_reached': 'Du kannst einen Vorschlag senden',
	'console.propose_for': 'Im Namen von {{name}} vorschlagen',
	'console.vote_for': 'Im Namen von {{name}} abstimmen',
	'console.save_for': 'Im Namen von {{name}} speichern',
	'console.entered_by_teacher': 'Von der Lehrkraft eingegeben',
	'console.proposal_sent_for': 'Der Vorschlag im Namen von {{name}} wurde gesendet',
	'console.proposal_saved_for': 'Der Vorschlag im Namen von {{name}} wurde gespeichert',
	'console.vote_counted_for': 'Die Stimme von {{name}} wurde gezählt',
	'console.act_for_next': 'Weiter: {{name}}',
	'console.act_for_limit':
		'Im Namen von {{name}} gibt es schon einen Vorschlag. Er kann bearbeitet werden',
	'console.act_for_closed': 'Die Abstimmung läuft: Vorschläge können nicht mehr geändert werden',
	'console.act_for_held': 'Die Stunde ist angehalten: Jetzt lässt sich nichts ändern',
	'console.act_for_vote_not_open': 'Die Abstimmung ist noch nicht geöffnet',
	'console.act_for_empty': 'Noch niemand ohne Gerät. Hier hinzufügen',
	'console.act_for_pick': 'Wähle einen Namen aus der Liste',
	'console.act_for_done': 'erledigt',
	'console.act_for_not_done': 'noch nicht erledigt',
	'console.act_for_table': 'Tisch',
	'console.act_for_text': 'Der Vorschlag',
};

export default actFor;

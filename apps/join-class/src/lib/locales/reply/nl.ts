// Dutch strings of the replies on a proposal (IA 22): the reply sheet,
// the author's notice, the push question and the teacher's replies group.
// Spread into ../nl.ts, so they ship in the same locale chunk.

const reply: Record<string, string> = {
	'reply.open': 'Reacties · {{n}}',
	'reply.title': 'Reacties op het voorstel',
	'reply.empty': 'Nog geen reacties. Wat kan er beter?',
	'reply.placeholder': 'Schrijf een reactie',
	'reply.send': 'Versturen',
	'reply.sending': 'Versturen…',
	'reply.by_author': 'De schrijvers van het voorstel',
	'reply.by_teacher': 'Docent',
	'reply.new_n': '{{n}} nieuwe reacties',
	'reply.new_one': '1 nieuwe reactie',
	'reply.improve': 'Mijn voorstel verbeteren',
	'reply.improve_closed': 'Voorstellen konden worden verbeterd tot de stemming openging',
	'reply.refused':
		'De reactie is niet verstuurd: er staan woorden in die kunnen kwetsen. Schrijf hem opnieuw, in andere woorden.',
	'reply.failed': 'De reactie is niet verstuurd. Probeer opnieuw',
	'reply.too_long': 'Maximaal {{max}} tekens',
	'reply.hidden_mine': 'De docent heeft deze reactie verborgen',
	'reply.back': 'Terug',
	'reply.count_left': 'Nog {{n}} tekens',
	'reply.push_ask': 'Wil je weten wanneer iemand op je voorstel reageert?',
	'reply.push_yes': 'Ja, laat het me weten',
	'reply.push_no': 'Nu niet',
	'reply.push_blocked':
		'De browser blokkeert meldingen. Reacties verschijnen nog steeds hier in de app',
	'console.replies': 'Reacties ({{n}})',
	'console.reply_placeholder': 'Reactie van de docent',
	'reply.notice_one': 'Er is een nieuwe reactie op jullie voorstel · Lezen',
	'reply.notice_n': '{{n}} nieuwe reacties op jullie voorstel · Lezen',
	'reply.new_tag': 'Nieuw',
	'reply.author_hint': 'Jullie kunnen terugreageren of jullie voorstel verbeteren',
	'console.proposal_label': 'Voorstel',
	'console.reply_label': 'Reactie',
	'console.replies_n': '{{n}} reacties',
	'console.replies_one': '1 reactie',
	'console.flags_n': '{{n}} pogingen om kwetsende woorden te plaatsen',
	'console.flags_one': '1 poging om kwetsende woorden te plaatsen',
	'console.flag_count': '{{n}} pogingen',
	'console.flag_count_one': '1 poging',
	'console.flag_show': 'Tekst tonen',
	'console.flag_hide_text': 'Tekst verbergen',
	'console.flag_seen': 'Gezien',
	'console.flag_target': 'Bij het voorstel: {{text}}',
	'proposal.refused':
		'Het voorstel is niet verstuurd: er staan woorden in die kunnen kwetsen. Schrijf het opnieuw, in andere woorden.',
	'text.checking': 'Controleren…',
};

export default reply;

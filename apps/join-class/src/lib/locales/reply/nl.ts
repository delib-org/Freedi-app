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
	'reply.toast': 'Nieuwe reactie op jullie voorstel',
	'reply.toast_open': 'Lezen',
	'reply.improve': 'Mijn voorstel verbeteren',
	'reply.improve_closed': 'Voorstellen konden worden verbeterd tot de stemming openging',
	'reply.refused': 'Je reactie lijkt kwetsende woorden te bevatten. Probeer het anders te zeggen.',
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
};

export default reply;

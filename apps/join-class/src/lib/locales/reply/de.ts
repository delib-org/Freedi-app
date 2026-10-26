// German strings of the replies on a proposal (IA 22): the reply sheet,
// the author's notice, the push question and the teacher's replies group.
// Spread into ../de.ts, so they ship in the same locale chunk.

const reply: Record<string, string> = {
	'reply.open': 'Kommentare · {{n}}',
	'reply.title': 'Kommentare zum Vorschlag',
	'reply.empty': 'Noch keine Kommentare. Was könnte besser werden?',
	'reply.placeholder': 'Kommentar schreiben',
	'reply.send': 'Senden',
	'reply.sending': 'Wird gesendet…',
	'reply.by_author': 'Die Verfasser des Vorschlags',
	'reply.by_teacher': 'Lehrkraft',
	'reply.new_n': '{{n}} neue Kommentare',
	'reply.new_one': '1 neuer Kommentar',
	'reply.toast': 'Neuer Kommentar zu eurem Vorschlag',
	'reply.toast_open': 'Lesen',
	'reply.improve': 'Meinen Vorschlag verbessern',
	'reply.improve_closed': 'Vorschläge konnten bis zum Start der Abstimmung verbessert werden',
	'reply.refused': 'Dein Kommentar scheint verletzende Wörter zu enthalten. Formuliere ihn anders.',
	'reply.failed': 'Der Kommentar wurde nicht gesendet. Erneut versuchen',
	'reply.too_long': 'Bis zu {{max}} Zeichen',
	'reply.hidden_mine': 'Die Lehrkraft hat diesen Kommentar ausgeblendet',
	'reply.back': 'Zurück',
	'reply.count_left': 'Noch {{n}} Zeichen',
	'reply.push_ask': 'Möchtest du erfahren, wenn jemand deinen Vorschlag kommentiert?',
	'reply.push_yes': 'Ja, Bescheid geben',
	'reply.push_no': 'Jetzt nicht',
	'reply.push_blocked':
		'Der Browser blockiert Benachrichtigungen. Kommentare erscheinen weiterhin hier in der App',
	'console.replies': 'Kommentare ({{n}})',
	'console.reply_placeholder': 'Kommentar der Lehrkraft',
};

export default reply;

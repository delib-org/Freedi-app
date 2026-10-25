// German strings of the vote: the student's ballot screen (voting.*) and
// the teacher's vote controls (console.*_vote). Spread into ../de.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const vote: Record<string, string> = {
	'console.open_vote': 'Abstimmung öffnen',
	'console.pause_vote': 'Abstimmung pausieren',
	'console.resume_vote': 'Abstimmung fortsetzen',
	'console.close_vote': 'Abstimmung schließen',
	'voting.title': 'Abstimmung',
	'voting.pick_one': 'Wählt einen Vorschlag',
	'voting.waiting': 'Wir warten, bis die Lehrkraft die Abstimmung öffnet',
	'voting.empty': 'Nichts zur Abstimmung',
	'voting.vote': 'Abstimmen',
	'voting.voted': 'Ihr habt abgestimmt',
	'voting.change': 'Stimme ändern',
	'voting.saving': 'Wird gespeichert…',
	'voting.closed': 'Die Abstimmung ist geschlossen',
	'voting.failed': 'Die Stimme wurde nicht gespeichert. Nochmal versuchen',
	'voting.paused': 'Die Abstimmung ist pausiert',
	'voting.paused_hint':
		'Die Lehrkraft hat die Abstimmung kurz pausiert. Deine Stimme bleibt erhalten.',
	'voting.closed_hint': 'Die Abstimmung ist geschlossen. Wir warten auf die Zusammenfassung',
	'console.vote_settings': 'Die Abstimmung',
	'console.vote_live_results': 'Die Lernenden sehen die Ergebnisse live',
	'console.vote_live_results_help':
		'Wie viele Stimmen jeder Vorschlag hat. Nie, wer wofür gestimmt hat.',
	'voting.result_votes': '{{percent}} % · {{n}} Stimmen',
	'voting.result_one_vote': '{{percent}} % · 1 Stimme',
	'console.vote_sort_by_support': 'Vorschläge nach Zustimmung ordnen',
	'console.vote_sort_by_support_help':
		'Während der Abstimmung rückt der Vorschlag mit den meisten Stimmen auf den Bildschirmen der Lernenden nach oben.',
};

export default vote;

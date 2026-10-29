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
	'voting.saving': 'Wird gespeichert…',
	'voting.counted': 'Eure Stimme wurde gezählt',
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
	// >>> voteSummary BEGIN
	'summary.vote_results': 'Ergebnis der Abstimmung',
	'summary.turnout': '{{n}} von {{m}} haben abgestimmt',
	'summary.leading': 'Liegt vorn',
	'summary.vote_open': 'Die Abstimmung ist noch offen',
	'summary.wait_close': 'Die Lehrkraft schließt die Abstimmung',
	'summary.no_vote': 'Es gab keine Abstimmung',
	'summary.most_agreed': 'Der Vorschlag mit der meisten Zustimmung',
	'summary.tie_by_ratings': 'Gleichstand, entschieden nach den Bewertungen',
	'summary.by_side_explain':
		'Wie sehr jede Seite die Entscheidung unterstützt, nach der Seite, die ihr zu Beginn gewählt habt',
	'summary.winner': 'Der gewählte Vorschlag',
	'console.close_and_go_title': 'Die Abstimmung ist noch offen. Schließen und zur Zusammenfassung?',
	'console.close_and_go_body': 'Nach dem Schließen kann niemand mehr seine Stimme ändern.',
	'console.close_and_go_yes': 'Schließen und weiter',
	'console.all_voted': 'Alle haben abgestimmt',
	'console.vote_order': 'Reihenfolge der Vorschläge',
	'console.vote_order_consensus': 'Nach den Bewertungen',
	'console.vote_order_votes': 'Nach Anzahl der Stimmen',
	'console.vote_order_random': 'Zufällige Reihenfolge',
	'console.vote_scope': 'Vorschläge in der Abstimmung',
	'console.vote_scope_all': 'Alle Vorschläge',
	'console.vote_scope_above': 'Nur über dem Ziel',
	'console.vote_scope_count': '{{above}} von {{total}} über dem Ziel',
	'console.vote_scope_none': 'Noch keiner liegt über dem Ziel, daher werden alle gezeigt',
	'console.vote_status_not_open': 'Noch nicht geöffnet',
	'console.vote_status_open': 'Abstimmung offen',
	'console.vote_status_paused': 'Abstimmung pausiert',
	'console.vote_status_closed': 'Abstimmung geschlossen',
	'console.vote_progress': '{{voted}} von {{present}} haben abgestimmt',
	'console.vote_reset_hint': 'Zuerst die Abstimmung schließen oder pausieren',
	// >>> voteSummary END
};

export default vote;

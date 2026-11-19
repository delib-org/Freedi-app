// de strings of the teacher console redesign (one next button, quiet screen, decision panel). Spread into ../de.ts.

const consoleUi: Record<string, string> = {
	'console.step.waiting': 'Die Schüler kommen herein',
	'console.settings_scope': 'Gilt nur für diese Stunde',
	'console.blocked.no_students': 'Noch keine Schüler zum Aufteilen',
	'console.blocked.no_proposals': 'Es gibt noch keine Vorschläge zur Abstimmung',
	'console.busy_closing': 'Wird geschlossen…',
	'console.busy_showing': 'Wird gezeigt…',
	'console.busy_splitting': 'Wird aufgeteilt…',
	'console.busy_copying': 'Wird übernommen…',
	'console.close_vote_title': '{{n}} haben noch nicht abgestimmt. Abstimmung schließen?',
	'console.close_vote_yes': 'Schließen',
	'console.vote_skip': 'Ohne Abstimmung zur Zusammenfassung',
	'console.vote_skip_title':
		'Die Abstimmung wurde nie geöffnet. Ohne Abstimmung zur Zusammenfassung?',
	'console.vote_skip_body': 'Die Zusammenfassung zeigt den Vorschlag mit der meisten Zustimmung.',
	'console.vote_skip_yes': 'Zur Zusammenfassung',
	'console.resplit_title': 'Die Klasse neu aufteilen?',
	'console.resplit_body':
		'Die aktuelle Sitzordnung geht verloren. Das lässt sich nicht rückgängig machen.',
	'console.all_steps': 'Alle Schritte',
	'console.step_now': 'Jetzt',
	'console.step_back_hint': 'Zu diesem Schritt zurückgehen',
	'console.step_back_tag': 'Zurück',
	'console.steps_forward_note':
		'Zum nächsten Schritt geht es nur mit dem großen Knopf, Schritt für Schritt.',
	'console.next_action_label': 'Die nächste Aktion',
};

export default consoleUi;

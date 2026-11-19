// nl strings of the teacher console redesign (one next button, quiet screen, decision panel). Spread into ../nl.ts.

const consoleUi: Record<string, string> = {
	'console.step.waiting': 'De leerlingen komen binnen',
	'console.settings_scope': 'Geldt alleen voor deze les',
	'console.blocked.no_students': 'Nog geen leerlingen om te verdelen',
	'console.blocked.no_proposals': 'Er zijn nog geen voorstellen om over te stemmen',
	'console.busy_closing': 'Bezig met sluiten…',
	'console.busy_showing': 'Bezig met tonen…',
	'console.busy_splitting': 'Bezig met verdelen…',
	'console.busy_copying': 'Bezig met overnemen…',
	'console.close_vote_title': '{{n}} hebben nog niet gestemd. Stemming sluiten?',
	'console.close_vote_yes': 'Sluiten',
	'console.vote_skip': 'Naar de samenvatting zonder stemming',
	'console.vote_skip_title': 'De stemming is nooit geopend. Naar de samenvatting zonder stemming?',
	'console.vote_skip_body': 'De samenvatting toont het voorstel met de meeste instemming.',
	'console.vote_skip_yes': 'Naar de samenvatting',
	'console.resplit_title': 'De klas opnieuw verdelen?',
	'console.resplit_body':
		'De huidige indeling gaat verloren. Dit kan niet ongedaan worden gemaakt.',
	'console.all_steps': 'Alle stappen',
	'console.step_now': 'Nu',
	'console.step_back_hint': 'Terug naar deze stap',
	'console.step_back_tag': 'Terug',
	'console.steps_forward_note': 'Je gaat alleen vooruit met de grote knop, stap voor stap.',
	'console.next_action_label': 'De volgende actie',
};

export default consoleUi;

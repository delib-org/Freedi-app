// Dutch strings of the vote: the student's ballot screen (voting.*) and
// the teacher's vote controls (console.*_vote). Spread into ../nl.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const vote: Record<string, string> = {
	'console.open_vote': 'Stemming openen',
	'console.pause_vote': 'Stemming pauzeren',
	'console.resume_vote': 'Stemming hervatten',
	'console.close_vote': 'Stemming sluiten',
	'voting.title': 'Stemming',
	'voting.pick_one': 'Kies één voorstel',
	'voting.waiting': 'Wachten tot de leraar de stemming opent',
	'voting.empty': 'Niets om op te stemmen',
	'voting.vote': 'Stemmen',
	'voting.voted': 'Jullie hebben gestemd',
	'voting.change': 'Stem wijzigen',
	'voting.saving': 'Opslaan…',
	'voting.closed': 'De stemming is gesloten',
	'voting.failed': 'De stem is niet opgeslagen. Probeer opnieuw',
	'voting.paused': 'De stemming is gepauzeerd',
	'voting.paused_hint': 'De docent heeft de stemming even gepauzeerd. Je stem blijft bewaard.',
	'voting.closed_hint': 'De stemming is gesloten. We wachten op de samenvatting',
	'console.vote_settings': 'De stemming',
	'console.vote_live_results': 'Leerlingen zien de uitslag live',
	'console.vote_live_results_help': 'Hoeveel stemmen elk voorstel heeft. Nooit wie waarop stemde.',
	'voting.result_votes': '{{percent}}% · {{n}} stemmen',
	'voting.result_one_vote': '{{percent}}% · 1 stem',
	'console.vote_sort_by_support': 'Voorstellen ordenen op steun',
	'console.vote_sort_by_support_help':
		'Tijdens de stemming schuift het voorstel met de meeste stemmen bovenaan op de schermen van de leerlingen.',
	// >>> voteSummary BEGIN
	'summary.vote_results': 'Uitslag van de stemming',
	'summary.turnout': '{{n}} van {{m}} hebben gestemd',
	'summary.leading': 'Staat nu voorop',
	'summary.vote_open': 'De stemming is nog open',
	'summary.wait_close': 'De docent sluit de stemming',
	'summary.no_vote': 'Er was geen stemming',
	'summary.most_agreed': 'Het voorstel met de meeste overeenstemming',
	'summary.tie_by_ratings': 'Gelijkspel, beslist op basis van de beoordelingen',
	'summary.by_side_explain':
		'Hoeveel elke kant de beslissing steunt, volgens de kant die je aan het begin van de les koos',
	'summary.winner': 'Het gekozen voorstel',
	'console.close_and_go_title': 'De stemming is nog open. Sluiten en naar de samenvatting?',
	'console.close_and_go_body': 'Na het sluiten kan niemand zijn stem nog wijzigen.',
	'console.close_and_go_yes': 'Sluiten en verder',
	'console.all_voted': 'Iedereen heeft gestemd',
	'console.vote_order': 'Volgorde van de voorstellen',
	'console.vote_order_consensus': 'Op beoordeling',
	'console.vote_order_consensus_help':
		'De voorstellen waar de klas het meest over eens is staan bovenaan, op telefoons en de beamer',
	'console.vote_order_votes': 'Op aantal stemmen',
	'console.vote_order_votes_help':
		'Het voorstel met de meeste stemmen schuift tijdens de stemming naar boven, op telefoons en de beamer',
	'console.vote_order_random': 'Willekeurige volgorde',
	'console.vote_order_random_help':
		'Iedereen ziet dezelfde volgorde en die verandert niet tijdens de stemming',
	// >>> voteSummary END
};

export default vote;

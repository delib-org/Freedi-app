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
	'console.vote_settings': 'De stemming',
	'console.vote_live_results': 'Leerlingen zien de uitslag live',
	'console.vote_live_results_help': 'Hoeveel stemmen elk voorstel heeft. Nooit wie waarop stemde.',
	'voting.result_votes': '{{percent}}% · {{n}} stemmen',
	'voting.result_one_vote': '{{percent}}% · 1 stem',
};

export default vote;

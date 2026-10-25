// English strings of the vote: the student's ballot screen (voting.*) and
// the teacher's vote controls (console.*_vote). Spread into ../en.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const vote: Record<string, string> = {
	'console.open_vote': 'Open the vote',
	'console.pause_vote': 'Pause the vote',
	'console.resume_vote': 'Resume the vote',
	'console.close_vote': 'Close the vote',
	'voting.title': 'Vote',
	'voting.pick_one': 'Choose one proposal',
	'voting.waiting': 'Waiting for the teacher to open the vote',
	'voting.empty': 'Nothing to vote on',
	'voting.vote': 'Vote',
	'voting.voted': 'You voted',
	'voting.change': 'Change vote',
	'voting.saving': 'Saving…',
	'voting.closed': 'The vote is closed',
	'voting.failed': 'The vote was not saved. Try again',
	'voting.paused': 'Voting is paused',
	'voting.paused_hint': 'The teacher paused the vote for now. Your vote is kept.',
	'voting.closed_hint': 'The vote is closed. Waiting for the summary',
	'console.vote_settings': 'The vote',
	'console.vote_live_results': 'Students see the results live',
	'console.vote_live_results_help': 'How many votes each proposal has. Never who voted for what.',
	'voting.result_votes': '{{percent}}% · {{n}} votes',
	'voting.result_one_vote': '{{percent}}% · 1 vote',
	// >>> voteSummary BEGIN
	'summary.vote_results': 'Vote results',
	'summary.turnout': '{{n}} of {{m}} voted',
	'summary.leading': 'Leading now',
	'summary.vote_open': 'The vote is still open',
	'summary.wait_close': 'The teacher will close the vote',
	'summary.no_vote': 'No vote was held',
	'summary.most_agreed': 'The most agreed proposal',
	'summary.tie_by_ratings': 'A tie, decided by the ratings',
	'summary.by_side_explain':
		'How much each side supports the decision, by the side you picked at the start of the lesson',
	'summary.winner': 'The chosen proposal',
	'console.close_and_go_title': 'The vote is still open. Close it and go to the summary?',
	'console.close_and_go_body': 'After closing, votes can no longer be changed.',
	'console.close_and_go_yes': 'Close and go',
	'console.all_voted': 'Everyone has voted',
	'console.vote_order': 'Order of the proposals',
	'console.vote_order_consensus': 'By the ratings',
	'console.vote_order_consensus_help':
		'The proposals the class agreed on most are on top, on phones and the projector',
	'console.vote_order_votes': 'By the number of votes',
	'console.vote_order_votes_help':
		'The proposal with the most votes moves to the top during the vote, on phones and the projector',
	'console.vote_order_random': 'Random order',
	'console.vote_order_random_help':
		'Everyone sees the same order, and it does not change during the vote',
	// >>> voteSummary END
};

export default vote;

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
	'console.vote_sort_by_support': 'Order the proposals by support',
	'console.vote_sort_by_support_help':
		"While the class votes, the proposal with the most votes moves to the top of the students' screens.",
};

export default vote;

// en strings of the teacher console redesign (one next button, quiet screen, decision panel). Spread into ../en.ts.

const consoleUi: Record<string, string> = {
	'console.step.waiting': 'Students are joining',
	'console.settings_scope': 'Applies to this lesson only',
	'console.blocked.no_students': 'No students to divide yet',
	'console.blocked.no_proposals': 'There are no proposals to vote on yet',
	'console.busy_closing': 'Closing…',
	'console.busy_showing': 'Showing…',
	'console.busy_splitting': 'Dividing…',
	'console.busy_copying': 'Bringing…',
	'console.close_vote_title': '{{n}} have not voted yet. Close the vote?',
	'console.close_vote_yes': 'Close',
	'console.vote_skip': 'Go to the summary without a vote',
	'console.vote_skip_title': 'The vote never opened. Go to the summary without a vote?',
	'console.vote_skip_body': 'The summary will show the most agreed proposal.',
	'console.vote_skip_yes': 'Go to the summary',
	'console.resplit_title': 'Divide the class again?',
	'console.resplit_body': 'The current seating will be lost. This cannot be undone.',
	'console.all_steps': 'All steps',
	'console.step_now': 'Now',
	'console.step_back_hint': 'Go back to this step',
	'console.step_back_tag': 'Go back',
	'console.steps_forward_note': 'You move forward only with the big button, one step at a time.',
	'console.next_action_label': 'The next action',
};

export default consoleUi;

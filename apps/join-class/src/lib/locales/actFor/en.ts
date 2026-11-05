// English strings of the proposal limit and of acting for a student without a device.
// Spread into ../en.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'Proposals per student',
	'console.proposal_limit_one': 'One',
	'console.proposal_limit_unlimited': 'Unlimited',
	'console.proposal_limit_help':
		'Going back to one removes nothing: proposals already sent stay, and whoever has one cannot add another',
	'proposal.limit_reached': 'You can send one proposal',
	'console.propose_for': 'Propose on behalf of {{name}}',
	'console.vote_for': 'Vote on behalf of {{name}}',
	'console.save_for': 'Save on behalf of {{name}}',
	'console.entered_by_teacher': 'Entered by teacher',
	'console.proposal_sent_for': 'The proposal on behalf of {{name}} was sent',
	'console.proposal_saved_for': 'The proposal on behalf of {{name}} was saved',
	'console.vote_counted_for': "{{name}}'s vote was counted",
	'console.act_for_next': 'Next: {{name}}',
	'console.act_for_limit': '{{name}} already has a proposal. It can be edited',
	'console.act_for_closed': 'The vote has opened: proposals can no longer change',
	'console.act_for_held': 'The lesson is stopped: nothing can change now',
	'console.act_for_vote_not_open': 'The vote is not open yet',
	'console.act_for_empty': 'Nobody here without a device yet. Add someone',
	'console.act_for_pick': 'Choose a name from the list',
	'console.act_for_done': 'done',
	'console.act_for_not_done': 'not done yet',
	'console.act_for_table': 'Table',
	'console.act_for_text': 'The proposal',
};

export default actFor;

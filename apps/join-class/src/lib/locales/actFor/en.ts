// English strings of the proposal limit and of acting for a student without a device.
// Spread into ../en.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'Proposals per student',
	'console.proposal_limit_one': 'One',
	'console.proposal_limit_unlimited': 'Unlimited',
	'console.proposal_limit_help':
		'Going back to one removes nothing: proposals already sent stay, and whoever has one cannot add another',
	'proposal.limit_reached': 'You can send one proposal',
};

export default actFor;

// Arabic strings of the proposal limit and of acting for a student without a device.
// Spread into ../ar.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'كم مقترحًا لكل شخص',
	'console.proposal_limit_one': 'مقترح واحد',
	'console.proposal_limit_unlimited': 'بلا حد',
	'console.proposal_limit_help':
		'العودة إلى مقترح واحد لا تحذف شيئًا: تبقى المقترحات المرسلة، ومن لديه مقترح لا يمكنه إضافة آخر',
	'proposal.limit_reached': 'يمكنك إرسال مقترح واحد',
};

export default actFor;

// Persian strings of the proposal limit and of acting for a student without a device.
// Spread into ../fa.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'چند پیشنهاد برای هر نفر',
	'console.proposal_limit_one': 'یک پیشنهاد',
	'console.proposal_limit_unlimited': 'بدون محدودیت',
	'console.proposal_limit_help':
		'بازگشت به یک پیشنهاد چیزی را حذف نمی‌کند: پیشنهادهای فرستاده‌شده می‌مانند و کسی که پیشنهادی دارد نمی‌تواند پیشنهاد دیگری اضافه کند',
	'proposal.limit_reached': 'می‌توانید یک پیشنهاد بفرستید',
};

export default actFor;

// Arabic strings of the proposal limit and of acting for a student without a device.
// Spread into ../ar.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'كم مقترحًا لكل شخص',
	'console.proposal_limit_one': 'مقترح واحد',
	'console.proposal_limit_unlimited': 'بلا حد',
	'console.proposal_limit_help':
		'العودة إلى مقترح واحد لا تحذف شيئًا: تبقى المقترحات المرسلة، ومن لديه مقترح لا يمكنه إضافة آخر',
	'proposal.limit_reached': 'يمكنك إرسال مقترح واحد',
	'console.propose_for': 'اقتراح باسم {{name}}',
	'console.vote_for': 'التصويت باسم {{name}}',
	'console.save_for': 'الحفظ باسم {{name}}',
	'console.entered_by_teacher': 'أدخله المعلم',
	'console.proposal_sent_for': 'أُرسل المقترح باسم {{name}}',
	'console.proposal_saved_for': 'حُفظ المقترح باسم {{name}}',
	'console.vote_counted_for': 'احتُسب صوت {{name}}',
	'console.act_for_next': 'التالي: {{name}}',
	'console.act_for_limit': 'يوجد مقترح باسم {{name}} بالفعل. يمكن تعديله',
	'console.act_for_closed': 'فُتح التصويت: لم يعد بالإمكان تغيير المقترحات',
	'console.act_for_held': 'الدرس متوقف: لا يمكن تغيير شيء الآن',
	'console.act_for_vote_not_open': 'لم يُفتح التصويت بعد',
	'console.act_for_empty': 'لا يوجد هنا أحد بلا جهاز بعد. يمكنك إضافة أحد',
	'console.act_for_pick': 'اختر اسمًا من القائمة',
	'console.act_for_done': 'تم',
	'console.act_for_not_done': 'لم يتم بعد',
	'console.act_for_table': 'الطاولة',
	'console.act_for_text': 'المقترح',
};

export default actFor;

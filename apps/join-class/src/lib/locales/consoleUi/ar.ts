// ar strings of the teacher console redesign (one next button, quiet screen, decision panel). Spread into ../ar.ts.

const consoleUi: Record<string, string> = {
	'console.step.waiting': 'الطلاب يدخلون',
	'console.settings_scope': 'يسري على هذا الدرس فقط',
	'console.blocked.no_students': 'لا يوجد طلاب للتقسيم بعد',
	'console.blocked.no_proposals': 'لا توجد اقتراحات للتصويت بعد',
	'console.busy_closing': 'جارٍ الإغلاق…',
	'console.busy_showing': 'جارٍ العرض…',
	'console.busy_splitting': 'جارٍ التقسيم…',
	'console.busy_copying': 'جارٍ الجلب…',
	'console.close_vote_title': '{{n}} لم يصوتوا بعد. إغلاق التصويت؟',
	'console.close_vote_yes': 'إغلاق',
	'console.vote_skip': 'الانتقال إلى الملخص بدون تصويت',
	'console.vote_skip_title': 'لم يُفتح التصويت. الانتقال إلى الملخص بدون تصويت؟',
	'console.vote_skip_body': 'سيعرض الملخص الاقتراح الأكثر موافقة.',
	'console.vote_skip_yes': 'الانتقال إلى الملخص',
	'console.resplit_title': 'إعادة تقسيم الصف؟',
	'console.resplit_body': 'سيُلغى الجلوس الحالي ولا يمكن التراجع عن ذلك.',
	'console.all_steps': 'كل المراحل',
	'console.step_now': 'الآن',
	'console.step_back_hint': 'العودة إلى هذه المرحلة',
	'console.step_back_tag': 'رجوع',
	'console.steps_forward_note': 'ننتقل إلى المرحلة التالية بالزر الكبير فقط، مرحلة بعد مرحلة.',
	'console.next_action_label': 'الإجراء التالي',
};

export default consoleUi;

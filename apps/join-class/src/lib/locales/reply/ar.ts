// Arabic strings of the replies on a proposal (IA 22): the reply sheet,
// the author's notice, the push question and the teacher's replies group.
// Spread into ../ar.ts, so they ship in the same locale chunk.

const reply: Record<string, string> = {
	'reply.open': 'التعليقات · {{n}}',
	'reply.title': 'تعليقات على الاقتراح',
	'reply.empty': 'لا توجد تعليقات بعد. ما الذي يمكن تحسينه؟',
	'reply.placeholder': 'اكتبوا تعليقًا',
	'reply.send': 'إرسال',
	'reply.sending': 'جارٍ الإرسال…',
	'reply.by_author': 'كاتبو الاقتراح',
	'reply.by_teacher': 'المعلم',
	'reply.new_n': '{{n}} تعليقات جديدة',
	'reply.new_one': 'تعليق جديد',
	'reply.improve': 'تحسين اقتراحي',
	'reply.improve_closed': 'كان يمكن تحسين الاقتراحات حتى فتح التصويت',
	'reply.refused': 'يبدو أن في التعليق كلمة جارحة. حاولوا الصياغة بشكل آخر',
	'reply.failed': 'لم يُرسل التعليق. حاولوا مرة أخرى',
	'reply.too_long': 'حتى {{max}} حرفًا',
	'reply.hidden_mine': 'أخفى المعلم هذا التعليق',
	'reply.back': 'رجوع',
	'reply.count_left': 'تبقّى {{n}} حرفًا',
	'reply.push_ask': 'هل تريدون أن تعرفوا عندما يعلّق أحد على اقتراحكم؟',
	'reply.push_yes': 'نعم، أخبروني',
	'reply.push_no': 'ليس الآن',
	'reply.push_blocked': 'المتصفح يحظر الإشعارات. التعليقات تظهر هنا في التطبيق',
	'console.replies': 'التعليقات ({{n}})',
	'console.reply_placeholder': 'تعليق المعلم',
	'reply.notice_one': 'يوجد تعليق جديد على اقتراحكم · للقراءة',
	'reply.notice_n': '{{n}} تعليقات جديدة على اقتراحكم · للقراءة',
	'reply.new_tag': 'جديد',
	'reply.author_hint': 'يمكنكم الرد، أو تحسين اقتراحكم',
};

export default reply;

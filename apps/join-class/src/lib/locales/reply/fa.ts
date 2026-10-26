// Persian strings of the replies on a proposal (IA 22): the reply sheet,
// the author's notice, the push question and the teacher's replies group.
// Spread into ../fa.ts, so they ship in the same locale chunk.

const reply: Record<string, string> = {
	'reply.open': 'نظرها · {{n}}',
	'reply.title': 'نظرها دربارهٔ پیشنهاد',
	'reply.empty': 'هنوز نظری نیست. چه چیزی را می‌شود بهتر کرد؟',
	'reply.placeholder': 'نظر بنویسید',
	'reply.send': 'ارسال',
	'reply.sending': 'در حال ارسال…',
	'reply.by_author': 'نویسندگان پیشنهاد',
	'reply.by_teacher': 'معلم',
	'reply.new_n': '{{n}} نظر تازه',
	'reply.new_one': 'یک نظر تازه',
	'reply.toast': 'نظر تازه دربارهٔ پیشنهاد شما',
	'reply.toast_open': 'خواندن',
	'reply.improve': 'بهتر کردن پیشنهادم',
	'reply.improve_closed': 'پیشنهادها تا باز شدن رأی‌گیری قابل بهتر شدن بودند',
	'reply.refused': 'به نظر می‌رسد در نظر شما واژه‌ای آزاردهنده هست. طور دیگری بنویسید',
	'reply.failed': 'نظر فرستاده نشد. دوباره تلاش کنید',
	'reply.too_long': 'تا {{max}} نویسه',
	'reply.hidden_mine': 'معلم این نظر را پنهان کرد',
	'reply.back': 'بازگشت',
	'reply.count_left': '{{n}} نویسه مانده',
	'reply.push_ask': 'می‌خواهید بدانید چه وقت کسی دربارهٔ پیشنهادتان نظر می‌دهد؟',
	'reply.push_yes': 'بله، خبرم کنید',
	'reply.push_no': 'حالا نه',
	'reply.push_blocked': 'مرورگر اعلان‌ها را مسدود کرده است. نظرها همین‌جا در برنامه دیده می‌شوند',
	'console.replies': 'نظرها ({{n}})',
	'console.reply_placeholder': 'نظر معلم',
};

export default reply;

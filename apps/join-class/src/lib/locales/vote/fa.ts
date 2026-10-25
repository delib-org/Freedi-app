// Persian strings of the vote: the student's ballot screen (voting.*) and
// the teacher's vote controls (console.*_vote). Spread into ../fa.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const vote: Record<string, string> = {
	'console.open_vote': 'باز کردن رأی‌گیری',
	'console.pause_vote': 'توقف موقت رأی‌گیری',
	'console.resume_vote': 'ادامهٔ رأی‌گیری',
	'console.close_vote': 'بستن رأی‌گیری',
	'voting.title': 'رأی‌گیری',
	'voting.pick_one': 'یک پیشنهاد انتخاب کنید',
	'voting.waiting': 'منتظر بمانید تا معلم رأی‌گیری را باز کند',
	'voting.empty': 'چیزی برای رأی دادن نیست',
	'voting.vote': 'رأی بدهید',
	'voting.voted': 'رأی دادید',
	'voting.change': 'تغییر رأی',
	'voting.saving': 'در حال ذخیره…',
	'voting.closed': 'رأی‌گیری بسته شد',
	'voting.failed': 'رأی ذخیره نشد. دوباره تلاش کنید',
	'voting.paused': 'رأی‌گیری موقتاً متوقف است',
	'voting.paused_hint': 'معلم رأی‌گیری را موقتاً متوقف کرد. رأی شما حفظ شده است.',
	'console.vote_settings': 'رأی‌گیری',
	'console.vote_live_results': 'دانش‌آموزان نتایج را زنده می‌بینند',
	'console.vote_live_results_help':
		'هر پیشنهاد چند رأی دارد. هرگز نشان نمی‌دهد چه کسی به چه چیزی رأی داده است.',
	'voting.result_votes': '{{percent}}٪ · {{n}} رأی',
	'voting.result_one_vote': '{{percent}}٪ · ۱ رأی',
};

export default vote;

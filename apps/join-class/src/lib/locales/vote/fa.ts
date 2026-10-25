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
	'voting.closed_hint': 'رأی‌گیری بسته شد. منتظر جمع‌بندی هستیم',
	'console.vote_settings': 'رأی‌گیری',
	'console.vote_live_results': 'دانش‌آموزان نتایج را زنده می‌بینند',
	'console.vote_live_results_help':
		'هر پیشنهاد چند رأی دارد. هرگز نشان نمی‌دهد چه کسی به چه چیزی رأی داده است.',
	'voting.result_votes': '{{percent}}٪ · {{n}} رأی',
	'voting.result_one_vote': '{{percent}}٪ · ۱ رأی',
	'console.vote_sort_by_support': 'مرتب‌سازی پیشنهادها بر اساس حمایت',
	'console.vote_sort_by_support_help':
		'در طول رأی‌گیری، پیشنهادی که بیشترین رأی را دارد در صفحهٔ دانش‌آموزان به بالا می‌رود.',
	// >>> voteSummary BEGIN
	'summary.vote_results': 'نتیجه رأی‌گیری',
	'summary.turnout': '{{n}} از {{m}} رأی دادند',
	'summary.leading': 'در حال پیشتازی',
	'summary.vote_open': 'رأی‌گیری هنوز باز است',
	'summary.wait_close': 'معلم رأی‌گیری را می‌بندد',
	'summary.no_vote': 'رأی‌گیری‌ای انجام نشد',
	'summary.most_agreed': 'پیشنهادی که بیشترین توافق را دارد',
	'summary.tie_by_ratings': 'تساوی. بر اساس امتیازها تصمیم گرفته شد',
	'summary.by_side_explain':
		'هر طرف تا چه اندازه از تصمیم حمایت می‌کند، بر اساس طرفی که در ابتدای درس انتخاب کردید',
	'summary.winner': 'پیشنهاد انتخاب‌شده',
	'console.close_and_go_title': 'رأی‌گیری هنوز باز است. بسته شود و به خلاصه برویم؟',
	'console.close_and_go_body': 'بعد از بستن، رأی‌ها دیگر قابل تغییر نیستند.',
	'console.close_and_go_yes': 'ببند و برو',
	'console.all_voted': 'همه رأی دادند',
	'console.vote_order': 'ترتیب پیشنهادها',
	'console.vote_order_consensus': 'بر اساس امتیازها',
	'console.vote_order_consensus_help':
		'پیشنهادهایی که کلاس بیشترین توافق را روی آن‌ها دارد بالا هستند، روی تلفن‌ها و پروژکتور',
	'console.vote_order_votes': 'بر اساس تعداد رأی',
	'console.vote_order_votes_help':
		'پیشنهاد با بیشترین رأی در طول رأی‌گیری بالا می‌آید، روی تلفن‌ها و پروژکتور',
	'console.vote_order_random': 'ترتیب تصادفی',
	'console.vote_order_random_help': 'همه ترتیب یکسانی می‌بینند و در طول رأی‌گیری تغییر نمی‌کند',
	// >>> voteSummary END
};

export default vote;

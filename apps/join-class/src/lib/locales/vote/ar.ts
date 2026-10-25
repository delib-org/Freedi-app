// Arabic strings of the vote: the student's ballot screen (voting.*) and
// the teacher's vote controls (console.*_vote). Spread into ../ar.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const vote: Record<string, string> = {
	'console.open_vote': 'فتح التصويت',
	'console.pause_vote': 'إيقاف التصويت مؤقتًا',
	'console.resume_vote': 'استئناف التصويت',
	'console.close_vote': 'إغلاق التصويت',
	'voting.title': 'التصويت',
	'voting.pick_one': 'اختاروا اقتراحاً واحداً',
	'voting.waiting': 'ننتظر أن يفتح المعلم التصويت',
	'voting.empty': 'لا شيء للتصويت عليه',
	'voting.vote': 'صوّتوا',
	'voting.voted': 'لقد صوّتم',
	'voting.change': 'تغيير التصويت',
	'voting.saving': 'جارٍ الحفظ…',
	'voting.closed': 'أُغلق التصويت',
	'voting.failed': 'لم يُحفظ التصويت. حاولوا مرة أخرى',
	'voting.paused': 'التصويت متوقف مؤقتًا',
	'voting.paused_hint': 'أوقف المعلّم التصويت مؤقتًا. صوتك محفوظ.',
	'voting.closed_hint': 'أُغلق التصويت. بانتظار الملخص',
	'console.vote_settings': 'التصويت',
	'console.vote_live_results': 'يرى الطلاب النتائج مباشرة',
	'console.vote_live_results_help': 'عدد الأصوات لكل اقتراح، دون إظهار من صوّت لأي اقتراح.',
	'voting.result_votes': '{{percent}}% · {{n}} أصوات',
	'voting.result_one_vote': '{{percent}}% · صوت واحد',
	'console.vote_sort_by_support': 'ترتيب الاقتراحات حسب التأييد',
	'console.vote_sort_by_support_help':
		'أثناء التصويت، يصعد الاقتراح الأكثر أصواتًا إلى أعلى شاشات الطلاب.',
	// >>> voteSummary BEGIN
	'summary.vote_results': 'نتائج التصويت',
	'summary.turnout': '{{n}} من {{m}} صوّتوا',
	'summary.leading': 'متقدمة الآن',
	'summary.vote_open': 'التصويت لا يزال مفتوحًا',
	'summary.wait_close': 'ستغلق المعلمة التصويت',
	'summary.no_vote': 'لم يُجرَ تصويت',
	'summary.most_agreed': 'الاقتراح الأكثر اتفاقًا عليه',
	'summary.tie_by_ratings': 'تعادل. حُسم بحسب التقييمات',
	'summary.by_side_explain': 'مدى تأييد كل طرف للقرار، بحسب الطرف الذي اخترتموه في بداية الدرس',
	'summary.winner': 'الاقتراح المختار',
	'console.close_and_go_title': 'التصويت لا يزال مفتوحًا. هل تغلقه وتنتقل إلى الملخص؟',
	'console.close_and_go_body': 'بعد الإغلاق لا يمكن تغيير الأصوات.',
	'console.close_and_go_yes': 'إغلاق وانتقال',
	'console.all_voted': 'صوّت الجميع',
	'console.vote_order': 'ترتيب الاقتراحات',
	'console.vote_order_consensus': 'حسب التقييمات',
	'console.vote_order_consensus_help':
		'الاقتراحات التي اتفق عليها الصف أكثر في الأعلى، على الهواتف وعلى شاشة العرض',
	'console.vote_order_votes': 'حسب عدد الأصوات',
	'console.vote_order_votes_help':
		'الاقتراح الأكثر أصواتًا يصعد إلى الأعلى أثناء التصويت، على الهواتف وعلى شاشة العرض',
	'console.vote_order_random': 'ترتيب عشوائي',
	'console.vote_order_random_help': 'الجميع يرون الترتيب نفسه ولا يتغير أثناء التصويت',
	// >>> voteSummary END
};

export default vote;

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
};

export default vote;

// fa strings of the teacher console redesign (one next button, quiet screen, decision panel). Spread into ../fa.ts.

const consoleUi: Record<string, string> = {
	'console.step.waiting': 'دانش‌آموزان در حال ورودند',
	'console.settings_scope': 'فقط برای همین درس',
	'console.blocked.no_students': 'هنوز دانش‌آموزی برای تقسیم نیست',
	'console.blocked.no_proposals': 'هنوز پیشنهادی برای رأی‌گیری نیست',
	'console.busy_closing': 'در حال بستن…',
	'console.busy_showing': 'در حال نمایش…',
	'console.busy_splitting': 'در حال تقسیم…',
	'console.busy_copying': 'در حال آوردن…',
	'console.close_vote_title': '{{n}} نفر هنوز رأی نداده‌اند. رأی‌گیری بسته شود؟',
	'console.close_vote_yes': 'ببند',
	'console.vote_skip': 'رفتن به خلاصه بدون رأی‌گیری',
	'console.vote_skip_title': 'رأی‌گیری هرگز باز نشد. بدون رأی‌گیری به خلاصه بروید؟',
	'console.vote_skip_body': 'خلاصه پیشنهادی را نشان می‌دهد که بیشترین موافقت را دارد.',
	'console.vote_skip_yes': 'رفتن به خلاصه',
	'console.resplit_title': 'کلاس دوباره تقسیم شود؟',
	'console.resplit_body': 'چیدمان فعلی از بین می‌رود و قابل بازگشت نیست.',
	'console.all_steps': 'همهٔ مرحله‌ها',
	'console.step_now': 'اکنون',
	'console.step_back_hint': 'بازگشت به این مرحله',
	'console.step_back_tag': 'بازگشت',
	'console.steps_forward_note': 'فقط با دکمهٔ بزرگ به مرحلهٔ بعد می‌روید، قدم به قدم.',
	'console.next_action_label': 'اقدام بعدی',
};

export default consoleUi;

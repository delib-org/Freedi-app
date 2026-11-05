// Persian strings of the proposal limit and of acting for a student without a device.
// Spread into ../fa.ts, so they ship in the same locale chunk; split out only to keep each file small.

const actFor: Record<string, string> = {
	'console.proposal_limit': 'چند پیشنهاد برای هر نفر',
	'console.proposal_limit_one': 'یک پیشنهاد',
	'console.proposal_limit_unlimited': 'بدون محدودیت',
	'console.proposal_limit_help':
		'بازگشت به یک پیشنهاد چیزی را حذف نمی‌کند: پیشنهادهای فرستاده‌شده می‌مانند و کسی که پیشنهادی دارد نمی‌تواند پیشنهاد دیگری اضافه کند',
	'proposal.limit_reached': 'می‌توانید یک پیشنهاد بفرستید',
	'console.propose_for': 'پیشنهاد به نام {{name}}',
	'console.vote_for': 'رأی به نام {{name}}',
	'console.save_for': 'ذخیره به نام {{name}}',
	'console.entered_by_teacher': 'واردشده توسط معلم',
	'console.proposal_sent_for': 'پیشنهاد به نام {{name}} فرستاده شد',
	'console.proposal_saved_for': 'پیشنهاد به نام {{name}} ذخیره شد',
	'console.vote_counted_for': 'رأی {{name}} ثبت شد',
	'console.act_for_next': 'بعدی: {{name}}',
	'console.act_for_limit': 'به نام {{name}} قبلاً پیشنهادی هست. می‌شود آن را ویرایش کرد',
	'console.act_for_closed': 'رأی‌گیری باز شده است: دیگر نمی‌شود پیشنهادها را تغییر داد',
	'console.act_for_held': 'درس متوقف است: الان چیزی را نمی‌شود تغییر داد',
	'console.act_for_vote_not_open': 'رأی‌گیری هنوز باز نشده است',
	'console.act_for_empty': 'هنوز کسی بدون دستگاه اینجا نیست. می‌توانید اضافه کنید',
	'console.act_for_pick': 'نامی را از فهرست انتخاب کنید',
	'console.act_for_done': 'انجام شد',
	'console.act_for_not_done': 'هنوز انجام نشده',
	'console.act_for_table': 'میز',
	'console.act_for_text': 'پیشنهاد',
};

export default actFor;

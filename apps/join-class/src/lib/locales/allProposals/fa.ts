// Farsi strings of "כל ההצעות" (IA 19): the phone's board (allProposals.*),
// the console lines and the projector title. Spread into ../fa.ts, so they
// ship in the same locale chunk; split out only to keep each file small.

const allProposals: Record<string, string> = {
	'step.allProposals': 'همهٔ پیشنهادها',
	'allProposals.instruction': 'به هر پیشنهاد امتیاز بدهید',
	'allProposals.new_n': '{{n}} پیشنهاد تازه',
	'allProposals.new_one': 'یک پیشنهاد تازه',
	'allProposals.progress': 'به {{n}} از {{m}} امتیاز دادید',
	'allProposals.done': 'به همهٔ پیشنهادها امتیاز دادید. منتظر معلم بمانید',
	'allProposals.more': '{{n}} پیشنهاد دیگر',
	'allProposals.seen_all': 'همهٔ پیشنهادها را دیدید',
	'allProposals.write_mine': '+ پیشنهاد خودم',
	'console.all_rated_line':
		'{{n}} از {{m}} دانش‌آموز به همه امتیاز دادند · هر پیشنهاد دست‌کم {{k}} امتیاز دارد',
	'console.table_rated_all': '{{n}}/{{m}} به همه امتیاز دادند',
	'projector.allProposals': 'همهٔ پیشنهادها · {{n}} پیشنهاد',
	'projector.allProposals_min': 'هر پیشنهاد دست‌کم {{k}} امتیاز دارد',
	'console.all_rated_line_one':
		'{{n}} از {{m}} دانش‌آموز به همه امتیاز دادند · هر پیشنهاد دست‌کم 1 امتیاز دارد',
	'projector.allProposals_min_one': 'هر پیشنهاد دست‌کم 1 امتیاز دارد',
	'console.all_rated_line_solo':
		'{{n}} از ۱ دانش‌آموز به همه امتیاز داد · هر پیشنهاد دست‌کم {{k}} امتیاز دارد',
	'console.all_rated_line_solo_one':
		'{{n}} از ۱ دانش‌آموز به همه امتیاز داد · هر پیشنهاد دست‌کم 1 امتیاز دارد',
};

export default allProposals;

// Persian strings of the Tables-Class bridge (IA tables-class-bridge): "הרשמה מראש", the Tables step of a
// connected lesson, the personal link and the name gate. Spread into ../fa.ts, so they ship in the same locale chunk.

const bridge: Record<string, string> = {
	'console.register_ahead': 'ثبت‌نام پیش از درس',
	'console.register_ahead.prompt': 'می‌خواهید پیش از درس ثبت‌نام کنند و میز بگیرند؟',
	'console.register_ahead.effects': 'با اتصال چه تغییر می‌کند',
	'console.register_ahead.effect.tables': 'میزها از ثبت‌نام می‌آیند.',
	'console.register_ahead.effect.side': 'پرسش موضع در ثبت‌نام جای «انتخاب سمت» را می‌گیرد.',
	'console.register_ahead.choose': 'کدام ثبت‌نام به این درس مربوط است؟',
	'console.register_ahead.connected_lead': 'این ثبت‌نام به درس وصل است',
	'console.register_ahead.connect': 'اتصال به درس',
	'console.register_ahead.new': 'ثبت‌نام جدید',
	'console.register_ahead.empty':
		'هنوز ثبت‌نامی ندارید. یکی را در Tables باز کنید و به اینجا برگردید.',
	'console.register_ahead.search': 'جست‌وجو با نام',
	'console.register_ahead.load_failed': 'بارگذاری ثبت‌نام‌های شما ممکن نشد',
	'console.register_ahead.manage': 'مدیریت ثبت‌نام',
	'console.register_ahead.status.draft': 'در حال آماده‌سازی',
	'console.register_ahead.status.registrationOpen': 'ثبت‌نام باز است',
	'console.register_ahead.status.registrationClosed': 'ثبت‌نام بسته شد',
	'console.register_ahead.status.published': 'چینش میزها منتشر شد',
	'console.register_ahead.status.ended': 'پایان یافت',
	'console.register_ahead.arrived': '{{arrived}} نفر از {{registered}} نفر رسیده‌اند',
	'console.register_ahead.gone': 'ثبت‌نام پیدا نشد. می‌توانید آن را از درس بردارید.',
	'console.register_ahead.side_removed':
		'ثبت‌نام موضع را می‌پرسد، پس این درس مرحلهٔ «انتخاب سمت» ندارد.',
	'console.register_ahead.close': 'بستن ثبت‌نام',
	'console.register_ahead.close_title': 'ثبت‌نام بسته شود؟',
	'console.register_ahead.close_body':
		'پس از بستن، کسی نمی‌تواند ثبت‌نام کند. وقتی موضوع انتخاب می‌شود، میزها هنگام بستن مشخص می‌شوند.',
	'console.register_ahead.close_yes': 'بله، بسته شود',
	'console.register_ahead.remove': 'برداشتن ثبت‌نام از درس',
	'console.register_ahead.remove_title': 'ثبت‌نام از درس برداشته شود؟',
	'console.register_ahead.remove_body':
		'ثبت‌نام و ثبت‌نام‌شدگان در Tables همان‌طور که هستند می‌مانند. پیوندهای شخصی از کار می‌افتند.',
	'console.register_ahead.remove_yes': 'بله، برداشته شود',
	'console.register_ahead.remove_locked': 'پس از آوردن میزها به درس نمی‌توان آن را برداشت.',
	'console.register_ahead.err.not_connected': 'هیچ ثبت‌نامی به این درس وصل نیست.',
	'console.register_ahead.err.connected_elsewhere': 'این ثبت‌نام قبلاً به درس دیگری وصل شده است.',
	'console.register_ahead.err.not_host': 'فقط حسابی که ثبت‌نام را باز کرده می‌تواند آن را وصل کند.',
	'console.register_ahead.err.ended': 'ثبت‌نام پایان یافته است.',
	'console.copy_seating': 'آوردن میزها از ثبت‌نام',
	'console.copy_seating.again': 'به‌روزرسانی از ثبت‌نام',
	'console.copy_seating.again_title': 'میزها از ثبت‌نام به‌روز شوند؟',
	'console.copy_seating.again_body':
		'میزها دوباره از ثبت‌نام می‌آیند و هر جابه‌جایی دستی که اینجا شده لغو می‌شود.',
	'console.copy_seating.again_yes': 'بله، به‌روز شود',
	'console.copy_seating.result':
		'{{tables}} میز آورده شد · {{arrived}} نفر رسیده‌اند · {{reserved}} نفر هنوز نرسیده‌اند',
	'console.copy_seating.not_ready.ranked': 'ابتدا چینش میزها را منتشر کنید',
	'console.copy_seating.not_ready.direct': 'ابتدا ثبت‌نام را ببندید',
	'console.copy_seating.not_tables_step': 'میزها را فقط در مرحلهٔ تقسیم به میزها می‌شود آورد.',
	'console.copy_seating.copied_already':
		'میزها قبلاً آورده شده‌اند. می‌توانید از ثبت‌نام به‌روز کنید.',
	'console.without_table': '{{count}} نفر بدون میز',
	'console.table_alone': 'فقط یک نفر پشت میز',
	'console.table_size.from_registration': 'در ثبت‌نام تعیین شده: {{n}}',
	'console.no_device.pick_reserved': 'از ثبت‌نام‌شدگانی که هنوز نرسیده‌اند',
	'console.no_device.seat_taken': 'این جا دیگر خالی نیست. دوباره انتخاب کنید.',
	'console.support_registration_failed': 'محاسبهٔ حمایت بر اساس موضع ممکن نشد.',
	'table.not_arrived': 'هنوز نرسیده‌اند',
	'seat.invalid.title': 'این پیوند دیگر فعال نیست',
	'seat.invalid.body': 'می‌توانید با کد روی صفحه و نوشتن نام کامل وارد شوید.',
	'seat.moved.title': 'گفتگو در دستگاه دیگری ادامه دارد',
	'seat.moved.body':
		'جای شما پشت میز به دستگاه دیگری رفته است. می‌توانید از اینجا دوباره وارد شوید تا جا به شما برگردد.',
	'seat.moved.action': 'ورود دوباره از اینجا',
	'opening.name_prompt.registered': 'نام کامل خود را همان‌طور که ثبت‌نام کردید بنویسید',
	'opening.name_not_found': 'ثبت‌نامی با این نام پیدا نکردیم.',
	'opening.name_not_found.fix': 'اصلاح نام',
	'opening.name_not_found.join_new': 'پیوستن بدون ثبت‌نام',
	'opening.name_taken': 'کسی قبلاً با این نام وارد شده است. شما هستید، از دستگاه دیگر؟',
	'opening.name_taken.yes': 'بله، خودم هستم',
	'opening.name_taken.no': 'نه، من کس دیگری هستم',
	'opening.name_twice': 'دو نفر با این نام ثبت‌نام کرده‌اند. میز شما کدام است؟',
	'opening.name_twice.choice': 'میز {{n}} · {{topic}}',
	'opening.name_twice.choice_plain': 'میز {{n}}',
	'opening.name_twice_later':
		'دو نفر با این نام ثبت‌نام کرده‌اند. وقتی میزها آمدند میز خود را انتخاب می‌کنید.',
	'table.pick_mine': 'انتخاب میز من',
	'table.alone':
		'فعلاً تنها پشت میز هستید. می‌توانید منتظر بقیه بمانید یا شما را به میز دیگری ببرند.',
	'table.no_seat_yet': 'هنوز میزی ندارید',
	'table.topic': 'موضوع: {{topic}}',
};

export default bridge;

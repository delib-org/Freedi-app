// Builds invented JSON report fixtures (short + long) for he / ar / fa.
// All text is made up. Nothing here comes from real residents.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'fixtures');
mkdirSync(outDir, { recursive: true });

const faDigits = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const same = (s) => String(s);

const L = {
	he: {
		dir: 'rtl',
		num: same,
		title: 'דוח קהילתי לדוגמה: מרחב משותף בשכונה',
		subtitle: 'נתוני דוגמה בדויים, 2026',
		headers: ['נושא', 'בעד', 'ניטרלי', 'נגד', 'סה"כ'],
		themes: ['ספסלים וצל בגינה', 'תאורת רחוב', 'שעות פתיחה של המרכז הקהילתי', 'נתיבי אופניים', 'חניה ברחוב הראשי', 'פינת קומפוסט'],
		h1: 'מבוא',
		h2: 'תוצאות לפי נושא',
		h3: 'מסקנות והמלצות',
		p: (n, pct) => `במפגש הדוגמה מספר ${n} השתתפו ${n * 37} אנשים, והם דירגו הצעות באמצעות מערכת Freedi. ההצעה על הוספת ספסלים קיבלה ${pct}% תמיכה, ו-${100 - pct}% נוספים נחלקו בין ניטרליות להתנגדות.`,
		cap: (n) => `טבלה ${n}: התפלגות הדירוגים (מספר משתתפים)`,
		foot: 'הערה: הנתונים בדויים ונועדו לבדיקת עימוד בלבד.',
		page: 'עמוד',
		of: 'מתוך',
	},
	ar: {
		dir: 'rtl',
		num: same,
		title: 'تقرير مجتمعي تجريبي: مساحة مشتركة في الحي',
		subtitle: 'بيانات تجريبية مختلقة، 2026',
		headers: ['الموضوع', 'مؤيد', 'محايد', 'معارض', 'المجموع'],
		themes: ['المقاعد والظل في الحديقة', 'إنارة الشوارع', 'ساعات عمل المركز المجتمعي', 'مسارات الدراجات', 'مواقف السيارات في الشارع الرئيسي', 'ركن السماد العضوي'],
		h1: 'مقدمة',
		h2: 'النتائج حسب الموضوع',
		h3: 'الاستنتاجات والتوصيات',
		p: (n, pct) => `شارك ${n * 37} شخصًا في اللقاء التجريبي رقم ${n}، وقيّموا المقترحات عبر نظام Freedi. حصل اقتراح إضافة مقاعد على دعم بنسبة ${pct}%، وانقسمت نسبة ${100 - pct}% الباقية بين الحياد والمعارضة.`,
		cap: (n) => `الجدول ${n}: توزيع التقييمات (عدد المشاركين)`,
		foot: 'ملاحظة: البيانات مختلقة وهي لاختبار التنسيق فقط.',
		page: 'صفحة',
		of: 'من',
	},
	fa: {
		dir: 'rtl',
		num: faDigits,
		title: 'گزارش نمونه جامعه: فضای مشترک محله',
		subtitle: 'داده‌های ساختگی نمونه، ۲۰۲۶',
		headers: ['موضوع', 'موافق', 'بی‌نظر', 'مخالف', 'جمع'],
		themes: ['نیمکت و سایه در پارک', 'روشنایی خیابان', 'ساعت کار مرکز محله', 'مسیر دوچرخه', 'پارک خودرو در خیابان اصلی', 'گوشه کمپوست'],
		h1: 'مقدمه',
		h2: 'نتایج بر اساس موضوع',
		h3: 'نتیجه‌گیری و پیشنهادها',
		p: (n, pct) => `در نشست نمونه شماره ${n} تعداد ${n * 37} نفر شرکت کردند و پیشنهادها را با سامانه Freedi امتیاز دادند. پیشنهاد افزودن نیمکت ${pct}٪ حمایت گرفت و ${100 - pct}٪ باقی‌مانده میان بی‌نظری و مخالفت تقسیم شد.`,
		cap: (n) => `جدول ${n}: توزیع امتیازها (تعداد شرکت‌کنندگان)`,
		foot: 'یادداشت: داده‌ها ساختگی و فقط برای آزمون صفحه‌آرایی هستند.',
		page: 'صفحه',
		of: 'از',
	},
};

function build(lang, { chapters, rowsPerTable, paragraphsPerChapter }) {
	const t = L[lang];
	const n = t.num;
	let seed = 7;
	const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	const sections = [];
	let tableNo = 0;
	for (let c = 1; c <= chapters; c++) {
		const paragraphs = [];
		for (let k = 0; k < paragraphsPerChapter; k++) {
			paragraphs.push(t.p(c + k, 40 + Math.floor(rnd() * 50)));
		}
		const rows = [];
		for (let r = 0; r < rowsPerTable; r++) {
			const pro = Math.floor(rnd() * 120), neu = Math.floor(rnd() * 50), con = Math.floor(rnd() * 70);
			rows.push([`${t.themes[r % t.themes.length]} ${n(r + 1)}`, n(pro), n(neu), n(con), n(pro + neu + con)]);
		}
		tableNo++;
		sections.push({
			heading: `${n(c)}. ${c === 1 ? t.h1 : c === chapters ? t.h3 : t.h2}`,
			paragraphs,
			table: { caption: t.cap(n(tableNo)), headers: t.headers, rows },
			footnote: t.foot,
		});
	}
	return { lang, dir: t.dir, title: t.title, subtitle: t.subtitle, page: t.page, of: t.of, num: lang === 'fa' ? 'fa' : 'latn', sections };
}

for (const lang of Object.keys(L)) {
	writeFileSync(join(outDir, `short-${lang}.json`), JSON.stringify(build(lang, { chapters: 3, rowsPerTable: 6, paragraphsPerChapter: 2 }), null, 2));
	// ~150 table rows total, about 40 pages
	writeFileSync(join(outDir, `long-${lang}.json`), JSON.stringify(build(lang, { chapters: 6, rowsPerTable: 25, paragraphsPerChapter: 84 }), null, 2));
}
console.info('fixtures written to', outDir);

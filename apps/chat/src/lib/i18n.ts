/**
 * Lightweight i18n (§6 components). A small reactive `t` store over inline
 * dictionaries for the 7 Freedi languages. SSR renders the default (en);
 * `initLang()` (onMount) switches to the user's language from `?lang=` /
 * localStorage / browser, and toggles RTL.
 */
import { writable, derived } from 'svelte/store';

export type Lang = 'en' | 'he' | 'ar' | 'es' | 'de' | 'nl' | 'fa';

export const RTL_LANGS: Lang[] = ['he', 'ar', 'fa'];

type Key =
	| 'app.title'
	| 'app.tagline'
	| 'discovery.noQuestions'
	| 'q.options'
	| 'q.addHeading'
	| 'q.allQuestions'
	| 'composer.proposeOption'
	| 'composer.askSubQuestion'
	| 'composer.standard'
	| 'composer.strengthen'
	| 'composer.critique'
	| 'composer.post'
	| 'eval.agree'
	| 'eval.disagree'
	| 'ai.summary'
	| 'ai.acceptRevision'
	| 'signin.cta';

type Dict = Record<Key, string>;

const en: Dict = {
	'app.title': 'Dialectical Chat',
	'app.tagline': 'Turn debate into evidence-weighted reasoning.',
	'discovery.noQuestions': 'No public questions yet.',
	'q.options': 'options',
	'q.addHeading': 'Add to this question',
	'q.allQuestions': 'All questions',
	'composer.proposeOption': 'Propose option',
	'composer.askSubQuestion': 'Ask sub-question',
	'composer.standard': 'Standard',
	'composer.strengthen': 'Strengthen',
	'composer.critique': 'Critique',
	'composer.post': 'Post',
	'eval.agree': 'Agree',
	'eval.disagree': 'Disagree',
	'ai.summary': 'AI Summary',
	'ai.acceptRevision': 'Accept revision',
	'signin.cta': 'Continue with Google',
};

const he: Dict = {
	'app.title': 'צ׳אט דיאלקטי',
	'app.tagline': 'הפכו ויכוח לחשיבה מבוססת ראיות.',
	'discovery.noQuestions': 'אין עדיין שאלות ציבוריות.',
	'q.options': 'אפשרויות',
	'q.addHeading': 'הוסיפו לשאלה זו',
	'q.allQuestions': 'כל השאלות',
	'composer.proposeOption': 'הציעו אפשרות',
	'composer.askSubQuestion': 'שאלו תת-שאלה',
	'composer.standard': 'רגיל',
	'composer.strengthen': 'חיזוק',
	'composer.critique': 'ביקורת',
	'composer.post': 'פרסמו',
	'eval.agree': 'מסכים',
	'eval.disagree': 'לא מסכים',
	'ai.summary': 'סיכום AI',
	'ai.acceptRevision': 'אשרו את הגרסה',
	'signin.cta': 'המשיכו עם Google',
};

const ar: Dict = {
	'app.title': 'محادثة جدلية',
	'app.tagline': 'حوّل النقاش إلى تفكير قائم على الأدلة.',
	'discovery.noQuestions': 'لا توجد أسئلة عامة بعد.',
	'q.options': 'خيارات',
	'q.addHeading': 'أضف إلى هذا السؤال',
	'q.allQuestions': 'كل الأسئلة',
	'composer.proposeOption': 'اقترح خيارًا',
	'composer.askSubQuestion': 'اطرح سؤالًا فرعيًا',
	'composer.standard': 'عادي',
	'composer.strengthen': 'تعزيز',
	'composer.critique': 'نقد',
	'composer.post': 'انشر',
	'eval.agree': 'أوافق',
	'eval.disagree': 'لا أوافق',
	'ai.summary': 'ملخص الذكاء الاصطناعي',
	'ai.acceptRevision': 'اقبل المراجعة',
	'signin.cta': 'المتابعة عبر Google',
};

const es: Dict = {
	'app.title': 'Chat Dialéctico',
	'app.tagline': 'Convierte el debate en razonamiento basado en evidencia.',
	'discovery.noQuestions': 'Aún no hay preguntas públicas.',
	'q.options': 'opciones',
	'q.addHeading': 'Añadir a esta pregunta',
	'q.allQuestions': 'Todas las preguntas',
	'composer.proposeOption': 'Proponer opción',
	'composer.askSubQuestion': 'Hacer subpregunta',
	'composer.standard': 'Estándar',
	'composer.strengthen': 'Reforzar',
	'composer.critique': 'Criticar',
	'composer.post': 'Publicar',
	'eval.agree': 'De acuerdo',
	'eval.disagree': 'En desacuerdo',
	'ai.summary': 'Resumen IA',
	'ai.acceptRevision': 'Aceptar revisión',
	'signin.cta': 'Continuar con Google',
};

const de: Dict = {
	'app.title': 'Dialektischer Chat',
	'app.tagline': 'Verwandle Debatte in evidenzbasiertes Denken.',
	'discovery.noQuestions': 'Noch keine öffentlichen Fragen.',
	'q.options': 'Optionen',
	'q.addHeading': 'Zu dieser Frage hinzufügen',
	'q.allQuestions': 'Alle Fragen',
	'composer.proposeOption': 'Option vorschlagen',
	'composer.askSubQuestion': 'Unterfrage stellen',
	'composer.standard': 'Standard',
	'composer.strengthen': 'Stärken',
	'composer.critique': 'Kritisieren',
	'composer.post': 'Senden',
	'eval.agree': 'Zustimmen',
	'eval.disagree': 'Ablehnen',
	'ai.summary': 'KI-Zusammenfassung',
	'ai.acceptRevision': 'Überarbeitung annehmen',
	'signin.cta': 'Mit Google fortfahren',
};

const nl: Dict = {
	'app.title': 'Dialectische Chat',
	'app.tagline': 'Maak van debat op bewijs gebaseerd redeneren.',
	'discovery.noQuestions': 'Nog geen openbare vragen.',
	'q.options': 'opties',
	'q.addHeading': 'Toevoegen aan deze vraag',
	'q.allQuestions': 'Alle vragen',
	'composer.proposeOption': 'Optie voorstellen',
	'composer.askSubQuestion': 'Subvraag stellen',
	'composer.standard': 'Standaard',
	'composer.strengthen': 'Versterken',
	'composer.critique': 'Bekritiseren',
	'composer.post': 'Plaatsen',
	'eval.agree': 'Eens',
	'eval.disagree': 'Oneens',
	'ai.summary': 'AI-samenvatting',
	'ai.acceptRevision': 'Revisie accepteren',
	'signin.cta': 'Doorgaan met Google',
};

const fa: Dict = {
	'app.title': 'گفتگوی دیالکتیکی',
	'app.tagline': 'بحث را به استدلال مبتنی بر شواهد تبدیل کنید.',
	'discovery.noQuestions': 'هنوز پرسش عمومی وجود ندارد.',
	'q.options': 'گزینه‌ها',
	'q.addHeading': 'به این پرسش بیفزایید',
	'q.allQuestions': 'همه پرسش‌ها',
	'composer.proposeOption': 'پیشنهاد گزینه',
	'composer.askSubQuestion': 'پرسش فرعی',
	'composer.standard': 'استاندارد',
	'composer.strengthen': 'تقویت',
	'composer.critique': 'نقد',
	'composer.post': 'ارسال',
	'eval.agree': 'موافق',
	'eval.disagree': 'مخالف',
	'ai.summary': 'خلاصه هوش مصنوعی',
	'ai.acceptRevision': 'پذیرش بازنگری',
	'signin.cta': 'ادامه با Google',
};

const DICTS: Record<Lang, Dict> = { en, he, ar, es, de, nl, fa };

export const isRTL = (lang: Lang): boolean => RTL_LANGS.includes(lang);

export const lang = writable<Lang>('en');

export const t = derived(lang, ($lang) => (key: Key): string => {
	const dict = DICTS[$lang] ?? en;

	return dict[key] ?? en[key] ?? key;
});

export function initLang(): void {
	if (typeof window === 'undefined') return;
	const url = new URL(window.location.href);
	const fromUrl = url.searchParams.get('lang') as Lang | null;
	const fromStorage = window.localStorage.getItem('chat.lang') as Lang | null;
	const fromBrowser = navigator.language.slice(0, 2) as Lang;
	const chosen = [fromUrl, fromStorage, fromBrowser].find((l) => l && l in DICTS) as Lang | undefined;
	const next = chosen ?? 'en';
	lang.set(next);
	window.localStorage.setItem('chat.lang', next);
	document.documentElement.lang = next;
	document.documentElement.dir = isRTL(next) ? 'rtl' : 'ltr';
}

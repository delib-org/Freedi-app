import m from 'mithril';

export type LangCode = 'he' | 'en' | 'ar' | 'es' | 'de' | 'nl';

const DEFAULT_LANG: LangCode = 'he';
const RTL_LANGS: ReadonlySet<string> = new Set(['he', 'ar']);
const STORAGE_KEY = 'agora_lang';

const translations: Record<LangCode, Record<string, string>> = {
	he: {
		'common.loading': 'טוען...',
		'common.error': 'משהו השתבש. נסו שוב.',
		'common.back': 'חזרה',
		'common.continue': 'המשך',
		'common.cancel': 'ביטול',
		'home.tagline': 'מסע בזמן. משימה אחת: להציל את התקופה.',
		'home.explanation':
			'הכיתה שלכם נבחרה לצאת למסע במנהרת הזמן, להבין את כל הצדדים, ולמצוא יחד פתרון שכולם יוכלו לחיות איתו.',
		'home.have_code': 'קיבלתם קוד מהמורה?',
		'home.code_placeholder': 'קוד כיתה',
		'home.join': 'הצטרפו למסע',
		'home.teacher': 'כניסת מורים',
		'home.sign_in': 'התחברות',
		'join.title': 'הצטרפות למסע',
		'join.team_question': 'כמה אתם ליד המחשב הזה?',
		'join.team_hint': 'אתם תשחקו יחד כצוות אחד',
		'join.joining': 'מצטרפים...',
		'join.join_now': 'יוצאים לדרך',
		'join.invalid_code': 'הקוד לא נמצא. בדקו עם המורה ונסו שוב.',
		'join.session_ended': 'המסע הזה כבר הסתיים.',
		'lobby.waiting': 'ממתינים למורה שתפתח את מנהרת הזמן...',
		'lobby.joined': 'נוסעים בזמן הצטרפו',
		'lobby.you_are': 'שם הקוד שלכם:',
		'lobby.get_ready': 'התכוננו. המסע עומד להתחיל.',
		'teacher.title': 'חדר המורה',
		'teacher.my_sessions': 'המסעות שלי',
		'teacher.new_session': 'מסע חדש',
		'teacher.choose_topic': 'בחרו חבילת נושא',
		'teacher.no_topics': 'אין עדיין חבילות נושא. צרו אחת חדשה.',
		'teacher.device_mode': 'איך התלמידים משחקים?',
		'teacher.individual': 'כל תלמיד במכשיר משלו',
		'teacher.team': 'צוותים של 2–3 ליד מחשב',
		'teacher.create': 'פתיחת מסע',
		'teacher.creating': 'פותחים מסע...',
		'teacher.session_code': 'קוד הצטרפות',
		'teacher.scan_to_join': 'סרקו כדי להצטרף',
		'teacher.participants': 'משתתפים',
		'teacher.start_journey': 'פתיחת מנהרת הזמן',
		'teacher.sign_in_required': 'כניסת מורים דורשת התחברות עם Google.',
	},
	en: {
		'common.loading': 'Loading...',
		'common.error': 'Something went wrong. Please try again.',
		'common.back': 'Back',
		'common.continue': 'Continue',
		'common.cancel': 'Cancel',
		'home.tagline': 'A journey through time. One mission: save the era.',
		'home.explanation':
			'Your class has been chosen to travel the time tunnel, understand every side, and find a solution everyone can live with.',
		'home.have_code': 'Got a code from your teacher?',
		'home.code_placeholder': 'Class code',
		'home.join': 'Join the journey',
		'home.teacher': 'Teacher entrance',
		'home.sign_in': 'Sign in',
		'join.title': 'Join the journey',
		'join.team_question': 'How many of you are at this device?',
		'join.team_hint': 'You will play together as one team',
		'join.joining': 'Joining...',
		'join.join_now': 'Set off',
		'join.invalid_code': 'Code not found. Check with your teacher and try again.',
		'join.session_ended': 'This journey has already ended.',
		'lobby.waiting': 'Waiting for the teacher to open the time tunnel...',
		'lobby.joined': 'time travelers joined',
		'lobby.you_are': 'Your code name:',
		'lobby.get_ready': 'Get ready. The journey is about to begin.',
		'teacher.title': 'Teacher room',
		'teacher.my_sessions': 'My journeys',
		'teacher.new_session': 'New journey',
		'teacher.choose_topic': 'Choose a topic package',
		'teacher.no_topics': 'No topic packages yet. Create a new one.',
		'teacher.device_mode': 'How do students play?',
		'teacher.individual': 'Each student on their own device',
		'teacher.team': 'Teams of 2–3 per computer',
		'teacher.create': 'Open journey',
		'teacher.creating': 'Opening journey...',
		'teacher.session_code': 'Join code',
		'teacher.scan_to_join': 'Scan to join',
		'teacher.participants': 'Participants',
		'teacher.start_journey': 'Open the time tunnel',
		'teacher.sign_in_required': 'Teacher entrance requires Google sign-in.',
	},
	ar: {
		'common.loading': 'جارٍ التحميل...',
		'common.error': 'حدث خطأ ما. حاولوا مرة أخرى.',
		'common.back': 'رجوع',
		'common.continue': 'متابعة',
		'common.cancel': 'إلغاء',
		'home.tagline': 'رحلة عبر الزمن. مهمة واحدة: إنقاذ الحقبة.',
		'home.explanation':
			'اختير صفكم للسفر عبر نفق الزمن، لفهم جميع الأطراف، وإيجاد حل يمكن للجميع التعايش معه.',
		'home.have_code': 'حصلتم على رمز من المعلم؟',
		'home.code_placeholder': 'رمز الصف',
		'home.join': 'انضموا إلى الرحلة',
		'home.teacher': 'مدخل المعلمين',
		'home.sign_in': 'تسجيل الدخول',
		'join.title': 'الانضمام إلى الرحلة',
		'join.team_question': 'كم عددكم عند هذا الجهاز؟',
		'join.team_hint': 'ستلعبون معًا كفريق واحد',
		'join.joining': 'جارٍ الانضمام...',
		'join.join_now': 'انطلقوا',
		'join.invalid_code': 'الرمز غير موجود. تحققوا مع المعلم وحاولوا مجددًا.',
		'join.session_ended': 'هذه الرحلة انتهت بالفعل.',
		'lobby.waiting': 'بانتظار أن يفتح المعلم نفق الزمن...',
		'lobby.joined': 'مسافرون عبر الزمن انضموا',
		'lobby.you_are': 'اسمكم الرمزي:',
		'lobby.get_ready': 'استعدوا. الرحلة على وشك البدء.',
		'teacher.title': 'غرفة المعلم',
		'teacher.my_sessions': 'رحلاتي',
		'teacher.new_session': 'رحلة جديدة',
		'teacher.choose_topic': 'اختاروا حزمة موضوع',
		'teacher.no_topics': 'لا توجد حزم مواضيع بعد. أنشئوا واحدة جديدة.',
		'teacher.device_mode': 'كيف يلعب التلاميذ؟',
		'teacher.individual': 'كل تلميذ على جهازه الخاص',
		'teacher.team': 'فرق من 2–3 عند كل حاسوب',
		'teacher.create': 'فتح رحلة',
		'teacher.creating': 'جارٍ فتح الرحلة...',
		'teacher.session_code': 'رمز الانضمام',
		'teacher.scan_to_join': 'امسحوا للانضمام',
		'teacher.participants': 'المشاركون',
		'teacher.start_journey': 'فتح نفق الزمن',
		'teacher.sign_in_required': 'مدخل المعلمين يتطلب تسجيل الدخول عبر Google.',
	},
	es: {
		'common.loading': 'Cargando...',
		'common.error': 'Algo salió mal. Inténtalo de nuevo.',
		'common.back': 'Atrás',
		'common.continue': 'Continuar',
		'common.cancel': 'Cancelar',
		'home.tagline': 'Un viaje en el tiempo. Una misión: salvar la época.',
		'home.explanation':
			'Vuestra clase ha sido elegida para viajar por el túnel del tiempo, comprender a todas las partes y encontrar una solución con la que todos puedan vivir.',
		'home.have_code': '¿Tenéis un código del profesor?',
		'home.code_placeholder': 'Código de clase',
		'home.join': 'Unirse al viaje',
		'home.teacher': 'Entrada de profesores',
		'home.sign_in': 'Iniciar sesión',
		'join.title': 'Unirse al viaje',
		'join.team_question': '¿Cuántos estáis en este dispositivo?',
		'join.team_hint': 'Jugaréis juntos como un solo equipo',
		'join.joining': 'Uniéndose...',
		'join.join_now': 'En marcha',
		'join.invalid_code': 'Código no encontrado. Consultad con el profesor e intentadlo de nuevo.',
		'join.session_ended': 'Este viaje ya ha terminado.',
		'lobby.waiting': 'Esperando a que el profesor abra el túnel del tiempo...',
		'lobby.joined': 'viajeros del tiempo se han unido',
		'lobby.you_are': 'Vuestro nombre en clave:',
		'lobby.get_ready': 'Preparaos. El viaje está a punto de comenzar.',
		'teacher.title': 'Sala del profesor',
		'teacher.my_sessions': 'Mis viajes',
		'teacher.new_session': 'Nuevo viaje',
		'teacher.choose_topic': 'Elige un paquete de tema',
		'teacher.no_topics': 'Aún no hay paquetes de temas. Crea uno nuevo.',
		'teacher.device_mode': '¿Cómo juegan los alumnos?',
		'teacher.individual': 'Cada alumno en su propio dispositivo',
		'teacher.team': 'Equipos de 2–3 por ordenador',
		'teacher.create': 'Abrir viaje',
		'teacher.creating': 'Abriendo viaje...',
		'teacher.session_code': 'Código de acceso',
		'teacher.scan_to_join': 'Escanead para uniros',
		'teacher.participants': 'Participantes',
		'teacher.start_journey': 'Abrir el túnel del tiempo',
		'teacher.sign_in_required': 'La entrada de profesores requiere iniciar sesión con Google.',
	},
	de: {
		'common.loading': 'Wird geladen...',
		'common.error': 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
		'common.back': 'Zurück',
		'common.continue': 'Weiter',
		'common.cancel': 'Abbrechen',
		'home.tagline': 'Eine Zeitreise. Eine Mission: die Epoche retten.',
		'home.explanation':
			'Eure Klasse wurde ausgewählt, durch den Zeittunnel zu reisen, alle Seiten zu verstehen und gemeinsam eine Lösung zu finden, mit der alle leben können.',
		'home.have_code': 'Habt ihr einen Code von eurer Lehrkraft?',
		'home.code_placeholder': 'Klassencode',
		'home.join': 'Der Reise beitreten',
		'home.teacher': 'Lehrkräfte-Eingang',
		'home.sign_in': 'Anmelden',
		'join.title': 'Der Reise beitreten',
		'join.team_question': 'Wie viele seid ihr an diesem Gerät?',
		'join.team_hint': 'Ihr spielt zusammen als ein Team',
		'join.joining': 'Beitreten...',
		'join.join_now': 'Los geht’s',
		'join.invalid_code': 'Code nicht gefunden. Fragt eure Lehrkraft und versucht es erneut.',
		'join.session_ended': 'Diese Reise ist bereits beendet.',
		'lobby.waiting': 'Warten, bis die Lehrkraft den Zeittunnel öffnet...',
		'lobby.joined': 'Zeitreisende beigetreten',
		'lobby.you_are': 'Euer Codename:',
		'lobby.get_ready': 'Macht euch bereit. Die Reise beginnt gleich.',
		'teacher.title': 'Lehrerzimmer',
		'teacher.my_sessions': 'Meine Reisen',
		'teacher.new_session': 'Neue Reise',
		'teacher.choose_topic': 'Themenpaket wählen',
		'teacher.no_topics': 'Noch keine Themenpakete. Erstellt ein neues.',
		'teacher.device_mode': 'Wie spielen die Schüler?',
		'teacher.individual': 'Jeder Schüler am eigenen Gerät',
		'teacher.team': 'Teams von 2–3 pro Computer',
		'teacher.create': 'Reise öffnen',
		'teacher.creating': 'Reise wird geöffnet...',
		'teacher.session_code': 'Beitrittscode',
		'teacher.scan_to_join': 'Zum Beitreten scannen',
		'teacher.participants': 'Teilnehmende',
		'teacher.start_journey': 'Zeittunnel öffnen',
		'teacher.sign_in_required': 'Der Lehrkräfte-Eingang erfordert eine Google-Anmeldung.',
	},
	nl: {
		'common.loading': 'Laden...',
		'common.error': 'Er ging iets mis. Probeer het opnieuw.',
		'common.back': 'Terug',
		'common.continue': 'Doorgaan',
		'common.cancel': 'Annuleren',
		'home.tagline': 'Een reis door de tijd. Eén missie: red het tijdperk.',
		'home.explanation':
			'Jullie klas is gekozen om door de tijdtunnel te reizen, alle kanten te begrijpen en samen een oplossing te vinden waar iedereen mee kan leven.',
		'home.have_code': 'Een code van je docent gekregen?',
		'home.code_placeholder': 'Klascode',
		'home.join': 'Doe mee aan de reis',
		'home.teacher': 'Docenteningang',
		'home.sign_in': 'Inloggen',
		'join.title': 'Doe mee aan de reis',
		'join.team_question': 'Met hoeveel zijn jullie bij dit apparaat?',
		'join.team_hint': 'Jullie spelen samen als één team',
		'join.joining': 'Deelnemen...',
		'join.join_now': 'Op weg',
		'join.invalid_code': 'Code niet gevonden. Vraag het je docent en probeer opnieuw.',
		'join.session_ended': 'Deze reis is al afgelopen.',
		'lobby.waiting': 'Wachten tot de docent de tijdtunnel opent...',
		'lobby.joined': 'tijdreizigers aangesloten',
		'lobby.you_are': 'Jullie codenaam:',
		'lobby.get_ready': 'Maak je klaar. De reis gaat zo beginnen.',
		'teacher.title': 'Docentenkamer',
		'teacher.my_sessions': 'Mijn reizen',
		'teacher.new_session': 'Nieuwe reis',
		'teacher.choose_topic': 'Kies een themapakket',
		'teacher.no_topics': 'Nog geen themapakketten. Maak een nieuw pakket.',
		'teacher.device_mode': 'Hoe spelen de leerlingen?',
		'teacher.individual': 'Elke leerling op een eigen apparaat',
		'teacher.team': 'Teams van 2–3 per computer',
		'teacher.create': 'Reis openen',
		'teacher.creating': 'Reis wordt geopend...',
		'teacher.session_code': 'Deelnamecode',
		'teacher.scan_to_join': 'Scan om mee te doen',
		'teacher.participants': 'Deelnemers',
		'teacher.start_journey': 'Open de tijdtunnel',
		'teacher.sign_in_required': 'De docenteningang vereist inloggen met Google.',
	},
};

const LANGUAGE_NAMES: Record<LangCode, string> = {
	he: 'עברית',
	en: 'English',
	ar: 'العربية',
	es: 'Español',
	de: 'Deutsch',
	nl: 'Nederlands',
};

let currentLang: LangCode = DEFAULT_LANG;

function isLangCode(value: string): value is LangCode {
	return value in translations;
}

function applyDirection(): void {
	document.documentElement.lang = currentLang;
	document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
}

export function initI18n(): void {
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && isLangCode(stored)) {
		currentLang = stored;
	} else {
		const browserLang = navigator.language.slice(0, 2);
		currentLang = isLangCode(browserLang) ? browserLang : DEFAULT_LANG;
	}
	applyDirection();
}

export function getLang(): LangCode {
	return currentLang;
}

export function setLang(lang: LangCode): void {
	currentLang = lang;
	localStorage.setItem(STORAGE_KEY, lang);
	applyDirection();
	m.redraw();
}

/** Check if current language is RTL */
export function isRTL(): boolean {
	return RTL_LANGS.has(currentLang);
}

export function t(key: string, params?: Record<string, string | number>): string {
	const text = translations[currentLang][key] ?? translations.en[key] ?? key;
	if (!params) return text;

	return Object.entries(params).reduce(
		(acc, [param, value]) => acc.replace(`{{${param}}}`, String(value)),
		text,
	);
}

export function getAvailableLanguages(): Array<{ code: LangCode; name: string }> {
	return (Object.keys(translations) as LangCode[]).map((code) => ({
		code,
		name: LANGUAGE_NAMES[code],
	}));
}

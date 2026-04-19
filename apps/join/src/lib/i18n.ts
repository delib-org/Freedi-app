import m from 'mithril';

const translations: Record<string, Record<string, string>> = {
  en: {
    'splash.title': 'Freedi',
    'solutions.loading': 'Loading...',
    'solutions.error.no_id': 'No question ID provided',
    'solutions.error.failed': 'Failed to load question',
    'solutions.error.not_found': 'Question not found',
    'solutions.error.no_options': 'No solutions available yet',
    'solutions.error.invalid_link': 'Please use a valid question link.',
    'solutions.subtitle.default': 'Please join activities that you want to promote, either as an activist or as an organizer',
    'solutions.subtitle.threshold': 'To activate an activity, we need at least {{requirements}}. Join to make it happen!',
    'solutions.counter.options': '{{count}} options',
    'solutions.counter.new': '{{count}} new',
    'card.activists': '{{count}} activists',
    'card.organizers': '{{count}} organizers',
    'card.join_activist': 'Join as activist',
    'card.joined_activist': 'Activist \u2713',
    'card.join_organizer': 'Join organizers',
    'card.joined_organizer': 'Organizer \u2713',
    'card.quota.activists_needed': 'Activists: {{count}} more needed',
    'card.quota.activists_met': '\u2705 Activists',
    'card.quota.organizers_needed': 'Organizers: {{count}} more needed',
    'card.quota.organizers_met': '\u2705 Organizers',
    'card.activated': '\u2705 Activated!',
    'card.new_messages': '{{count}} new message',
    'card.new_messages_plural': '{{count}} new messages',
    'threshold.organizers': '{{count}} organizer',
    'threshold.organizers_plural': '{{count}} organizers',
    'threshold.activists': '{{count}} activist',
    'threshold.activists_plural': '{{count}} activists',
    'chat.loading': 'Loading...',
    'chat.not_found': 'Solution not found',
    'chat.empty': 'No messages yet. Start the conversation!',
    'chat.open': 'Open chat',
    'chat.placeholder': 'Type a message...',
    'chat.send': 'Send message',
    'chat.back': 'Back to solutions',
    'chat.new_message': '{{count}} new message',
    'chat.new_messages': '{{count}} new messages',
    'chat.name_prompt': 'Enter your name to join the chat:',
    'chat.name_placeholder': 'Your name',
    'chat.name_continue': 'Continue',
    'chat.name_anonymous': 'Stay anonymous',
    'chat.set_name': 'Set your name',
    'form.title': 'Join Information',
    'form.your_name': 'Your Name',
    'form.cancel': 'Cancel',
    'form.submit': 'Join',
    'form.submitting': 'Submitting...',
    'common.anonymous': 'Anonymous',
  },
  he: {
    'splash.title': 'Freedi',
    'solutions.loading': 'טוען...',
    'solutions.error.no_id': 'לא סופק מזהה שאלה',
    'solutions.error.failed': 'טעינת השאלה נכשלה',
    'solutions.error.not_found': 'השאלה לא נמצאה',
    'solutions.error.no_options': 'אין פתרונות זמינים עדיין',
    'solutions.error.invalid_link': 'נא להשתמש בקישור תקין לשאלה.',
    'solutions.subtitle.default': 'הצטרפו לפעילויות שאתם רוצים לקדם, כפעילים או כמארגנים',
    'solutions.subtitle.threshold': 'כדי להפעיל פעילות, אנחנו צריכים לפחות {{requirements}}. הצטרפו כדי לגרום לזה לקרות!',
    'solutions.counter.options': '{{count}} אפשרויות',
    'solutions.counter.new': '{{count}} חדשות',
    'card.activists': '{{count}} פעילים',
    'card.organizers': '{{count}} מארגנים',
    'card.join_activist': 'הצטרף כפעיל',
    'card.joined_activist': 'פעיל \u2713',
    'card.join_organizer': 'הצטרף כמארגן',
    'card.joined_organizer': 'מארגן \u2713',
    'card.quota.activists_needed': 'פעילים: צריך עוד {{count}}',
    'card.quota.activists_met': '\u2705 פעילים',
    'card.quota.organizers_needed': 'מארגנים: צריך עוד {{count}}',
    'card.quota.organizers_met': '\u2705 מארגנים',
    'card.activated': '\u2705 הופעל!',
    'card.new_messages': '{{count}} הודעה חדשה',
    'card.new_messages_plural': '{{count}} הודעות חדשות',
    'threshold.organizers': '{{count}} מארגן',
    'threshold.organizers_plural': '{{count}} מארגנים',
    'threshold.activists': '{{count}} פעיל',
    'threshold.activists_plural': '{{count}} פעילים',
    'chat.loading': 'טוען...',
    'chat.not_found': 'הפתרון לא נמצא',
    'chat.empty': 'אין הודעות עדיין. התחילו את השיחה!',
    'chat.open': 'פתח צ\'אט',
    'chat.placeholder': 'כתבו הודעה...',
    'chat.send': 'שלח הודעה',
    'chat.back': 'חזרה לפתרונות',
    'chat.new_message': '{{count}} הודעה חדשה',
    'chat.new_messages': '{{count}} הודעות חדשות',
    'chat.name_prompt': 'הכניסו את שמכם כדי להצטרף לצ\'אט:',
    'chat.name_placeholder': 'השם שלך',
    'chat.name_continue': 'המשך',
    'chat.name_anonymous': 'הישאר אנונימי',
    'chat.set_name': 'הגדר את שמך',
    'form.title': 'פרטי הצטרפות',
    'form.your_name': 'השם שלך',
    'form.cancel': 'ביטול',
    'form.submit': 'הצטרף',
    'form.submitting': 'שולח...',
    'common.anonymous': 'אנונימי',
  },
  ar: {
    'splash.title': 'Freedi',
    'solutions.loading': 'جارٍ التحميل...',
    'solutions.error.no_id': 'لم يتم توفير معرّف السؤال',
    'solutions.error.failed': 'فشل تحميل السؤال',
    'solutions.error.not_found': 'السؤال غير موجود',
    'solutions.error.no_options': 'لا توجد حلول متاحة بعد',
    'solutions.error.invalid_link': 'يرجى استخدام رابط سؤال صالح.',
    'solutions.subtitle.default': 'انضم إلى الأنشطة التي تريد تعزيزها، سواء كناشط أو كمنظّم',
    'solutions.subtitle.threshold': 'لتفعيل نشاط، نحتاج على الأقل {{requirements}}. انضم لتحقيق ذلك!',
    'solutions.counter.options': '{{count}} خيارات',
    'solutions.counter.new': '{{count}} جديد',
    'card.activists': '{{count}} ناشطين',
    'card.organizers': '{{count}} منظّمين',
    'card.join_activist': 'انضم كناشط',
    'card.joined_activist': 'ناشط \u2713',
    'card.join_organizer': 'انضم كمنظّم',
    'card.joined_organizer': 'منظّم \u2713',
    'card.quota.activists_needed': 'ناشطون: نحتاج {{count}} إضافيين',
    'card.quota.activists_met': '\u2705 ناشطون',
    'card.quota.organizers_needed': 'منظّمون: نحتاج {{count}} إضافيين',
    'card.quota.organizers_met': '\u2705 منظّمون',
    'card.activated': '\u2705 تم التفعيل!',
    'threshold.organizers': '{{count}} منظّم',
    'threshold.organizers_plural': '{{count}} منظّمين',
    'threshold.activists': '{{count}} ناشط',
    'threshold.activists_plural': '{{count}} ناشطين',
    'chat.loading': 'جارٍ التحميل...',
    'chat.not_found': 'الحل غير موجود',
    'chat.empty': 'لا توجد رسائل بعد. ابدأ المحادثة!',
    'chat.open': 'فتح الدردشة',
    'chat.placeholder': 'اكتب رسالة...',
    'chat.send': 'إرسال',
    'chat.back': 'العودة إلى الحلول',
    'chat.new_message': '{{count}} رسالة جديدة',
    'chat.new_messages': '{{count}} رسائل جديدة',
    'chat.name_prompt': 'أدخل اسمك للانضمام إلى الدردشة:',
    'chat.name_placeholder': 'اسمك',
    'chat.name_continue': 'متابعة',
    'chat.name_anonymous': 'ابقَ مجهولاً',
    'chat.set_name': 'حدد اسمك',
    'form.title': 'معلومات الانضمام',
    'form.your_name': 'اسمك',
    'form.cancel': 'إلغاء',
    'form.submit': 'انضم',
    'form.submitting': 'جارٍ الإرسال...',
    'common.anonymous': 'مجهول',
  },
  de: {
    'solutions.loading': 'Laden...',
    'solutions.error.not_found': 'Frage nicht gefunden',
    'solutions.error.no_options': 'Noch keine Lösungen verfügbar',
    'solutions.error.invalid_link': 'Bitte verwenden Sie einen gültigen Fragelink.',
    'solutions.subtitle.default': 'Treten Sie Aktivitäten bei, die Sie fördern möchten, entweder als Aktivist oder als Organisator',
    'solutions.subtitle.threshold': 'Um eine Aktivität zu aktivieren, brauchen wir mindestens {{requirements}}. Machen Sie mit!',
    'solutions.counter.options': '{{count}} Optionen',
    'solutions.counter.new': '{{count}} neu',
    'card.activists': '{{count}} Aktivisten',
    'card.organizers': '{{count}} Organisatoren',
    'card.join_activist': 'Als Aktivist beitreten',
    'card.joined_activist': 'Aktivist \u2713',
    'card.join_organizer': 'Als Organisator beitreten',
    'card.joined_organizer': 'Organisator \u2713',
    'chat.empty': 'Noch keine Nachrichten. Starten Sie das Gespräch!',
    'chat.open': 'Chat öffnen',
    'chat.placeholder': 'Nachricht eingeben...',
    'chat.name_prompt': 'Geben Sie Ihren Namen ein, um dem Chat beizutreten:',
    'chat.name_continue': 'Weiter',
    'chat.name_anonymous': 'Anonym bleiben',
    'form.title': 'Beitrittsinformationen',
    'form.cancel': 'Abbrechen',
    'form.submit': 'Beitreten',
    'common.anonymous': 'Anonym',
  },
  es: {
    'solutions.loading': 'Cargando...',
    'solutions.error.not_found': 'Pregunta no encontrada',
    'solutions.error.no_options': 'Aún no hay soluciones disponibles',
    'solutions.error.invalid_link': 'Por favor, use un enlace de pregunta válido.',
    'solutions.subtitle.default': 'Únase a las actividades que desea promover, ya sea como activista o como organizador',
    'solutions.subtitle.threshold': 'Para activar una actividad, necesitamos al menos {{requirements}}. ¡Únase para hacerlo realidad!',
    'solutions.counter.options': '{{count}} opciones',
    'solutions.counter.new': '{{count}} nuevas',
    'card.activists': '{{count}} activistas',
    'card.organizers': '{{count}} organizadores',
    'card.join_activist': 'Unirse como activista',
    'card.joined_activist': 'Activista \u2713',
    'card.join_organizer': 'Unirse como organizador',
    'card.joined_organizer': 'Organizador \u2713',
    'chat.empty': 'No hay mensajes aún. ¡Inicie la conversación!',
    'chat.open': 'Abrir chat',
    'chat.placeholder': 'Escribe un mensaje...',
    'chat.name_prompt': 'Ingrese su nombre para unirse al chat:',
    'chat.name_continue': 'Continuar',
    'chat.name_anonymous': 'Permanecer anónimo',
    'form.title': 'Información de unión',
    'form.cancel': 'Cancelar',
    'form.submit': 'Unirse',
    'common.anonymous': 'Anónimo',
  },
  nl: {
    'solutions.loading': 'Laden...',
    'solutions.error.not_found': 'Vraag niet gevonden',
    'solutions.error.no_options': 'Nog geen oplossingen beschikbaar',
    'solutions.subtitle.default': 'Sluit u aan bij activiteiten die u wilt bevorderen, als activist of als organisator',
    'solutions.subtitle.threshold': 'Om een activiteit te activeren hebben we minimaal {{requirements}} nodig. Doe mee!',
    'card.activists': '{{count}} activisten',
    'card.organizers': '{{count}} organisatoren',
    'card.join_activist': 'Word activist',
    'card.joined_activist': 'Activist \u2713',
    'card.join_organizer': 'Word organisator',
    'card.joined_organizer': 'Organisator \u2713',
    'chat.empty': 'Nog geen berichten. Begin het gesprek!',
    'chat.open': 'Chat openen',
    'chat.placeholder': 'Typ een bericht...',
    'chat.name_prompt': 'Voer uw naam in om deel te nemen aan de chat:',
    'chat.name_continue': 'Doorgaan',
    'chat.name_anonymous': 'Anoniem blijven',
    'form.title': 'Deelname-informatie',
    'form.cancel': 'Annuleren',
    'form.submit': 'Deelnemen',
    'common.anonymous': 'Anoniem',
  },
  fa: {
    'solutions.loading': 'در حال بارگذاری...',
    'solutions.error.not_found': 'سؤال یافت نشد',
    'solutions.error.no_options': 'هنوز راه‌حلی موجود نیست',
    'solutions.subtitle.default': 'به فعالیت‌هایی که می‌خواهید ترویج دهید بپیوندید، چه به عنوان فعال و چه به عنوان سازمان‌دهنده',
    'solutions.subtitle.threshold': 'برای فعال‌سازی یک فعالیت، حداقل به {{requirements}} نیاز داریم. بپیوندید!',
    'card.activists': '{{count}} فعال',
    'card.organizers': '{{count}} سازمان‌دهنده',
    'card.join_activist': 'پیوستن به عنوان فعال',
    'card.joined_activist': 'فعال \u2713',
    'card.join_organizer': 'پیوستن به عنوان سازمان‌دهنده',
    'card.joined_organizer': 'سازمان‌دهنده \u2713',
    'chat.empty': 'هنوز پیامی نیست. گفتگو را شروع کنید!',
    'chat.open': 'باز کردن گفتگو',
    'chat.placeholder': 'پیام بنویسید...',
    'chat.name_prompt': 'نام خود را وارد کنید تا به چت بپیوندید:',
    'chat.name_continue': 'ادامه',
    'chat.name_anonymous': 'ناشناس بمانید',
    'form.title': 'اطلاعات عضویت',
    'form.cancel': 'لغو',
    'form.submit': 'پیوستن',
    'common.anonymous': 'ناشناس',
  },
};

type LangCode = string;
let currentLang: LangCode = 'en';

// Did the user make an explicit language choice (via ?lang= or prior setLang)?
// If not, the statement's defaultLanguage is allowed to override the browser
// default on load.
let userExplicitLang = false;

function detectLanguage(): { lang: LangCode; explicit: boolean } {
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  if (urlLang && translations[urlLang]) {
    return { lang: urlLang, explicit: true };
  }

  const stored = localStorage.getItem('freedi_join_lang');
  if (stored && translations[stored]) {
    return { lang: stored, explicit: true };
  }

  const browserLang = navigator.language.split('-')[0];
  if (translations[browserLang]) {
    return { lang: browserLang, explicit: false };
  }

  return { lang: 'en', explicit: false };
}

function applyLang(lang: LangCode): void {
  currentLang = lang;
  document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  document.documentElement.lang = currentLang;
}

export function initI18n(): void {
  const { lang, explicit } = detectLanguage();
  userExplicitLang = explicit;
  applyLang(lang);
}

export function getLang(): LangCode {
  return currentLang;
}

export function setLang(lang: LangCode): void {
  if (!translations[lang]) return;
  userExplicitLang = true;
  localStorage.setItem('freedi_join_lang', lang);
  applyLang(lang);
  m.redraw();
}

/**
 * Apply the language preference declared on a Statement (typically the
 * question set in the main app). Priority rules:
 *   - statement.forceLanguage === true  →  always wins, even over URL/localStorage
 *   - otherwise, statement.defaultLanguage wins only when the user hasn't
 *     made an explicit choice (URL param or prior setLang)
 * Returns true if the active language changed.
 */
export function applyStatementLanguage(
  defaultLanguage?: string,
  forceLanguage?: boolean,
): boolean {
  if (!defaultLanguage || !translations[defaultLanguage]) return false;
  if (defaultLanguage === currentLang) return false;

  const shouldApply = forceLanguage === true || !userExplicitLang;
  if (!shouldApply) return false;

  applyLang(defaultLanguage);

  return true;
}

export function isRTL(): boolean {
  return currentLang === 'he' || currentLang === 'ar' || currentLang === 'fa';
}

export function t(key: string, params?: Record<string, string | number>): string {
  const langDict = translations[currentLang] ?? translations.en;
  let text = langDict[key] ?? translations.en[key] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }

  return text;
}

export function getAvailableLanguages(): Array<{ code: string; name: string }> {
  return [
    { code: 'en', name: 'English' },
    { code: 'he', name: 'עברית' },
    { code: 'ar', name: 'العربية' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'fa', name: 'فارسی' },
  ];
}

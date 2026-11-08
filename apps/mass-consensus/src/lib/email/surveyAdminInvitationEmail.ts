import { SurveyAdminRole } from '@freedi/shared-types';
import { getEmailTransporter, getFromAddress } from './transporter';
import { logger } from '@/lib/utils/logger';

/** Languages the invitation email is written in. Falls back to `en`. */
export type EmailLanguage = 'en' | 'he' | 'ar' | 'es' | 'de' | 'nl' | 'fa';

const SUPPORTED: readonly EmailLanguage[] = ['en', 'he', 'ar', 'es', 'de', 'nl', 'fa'];
const RTL: readonly EmailLanguage[] = ['he', 'ar', 'fa'];

/** Narrow an arbitrary language code (`he-IL`, `HE`, undefined) to a supported one. */
export function toEmailLanguage(code: string | undefined | null): EmailLanguage {
  const base = code?.trim().toLowerCase().split(/[-_]/)[0] ?? '';

  return (SUPPORTED as readonly string[]).includes(base) ? (base as EmailLanguage) : 'en';
}

/** Escape user-supplied values before interpolating into email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface Strings {
  subject: (survey: string) => string;
  greeting: string;
  /** Inviter invited you to co-administer "survey" as <role>. */
  body: (inviter: string, survey: string, role: string) => string;
  roleViewer: string;
  roleEditor: string;
  viewerNote: string;
  editorNote: string;
  cta: string;
  signInNote: string;
  expiryNote: (days: number) => string;
  fallbackNote: string;
}

const STRINGS: Record<EmailLanguage, Strings> = {
  en: {
    subject: (s) => `You've been invited to administer "${s}" on Freedi`,
    greeting: 'Hello,',
    body: (inviter, survey, role) =>
      `${inviter} invited you to help administer the survey <strong>"${survey}"</strong> on Freedi as <strong>${role}</strong>.`,
    roleViewer: 'a viewer',
    roleEditor: 'an editor',
    viewerNote: 'You will be able to see everything the survey owner sees — questions, results and participation — but not change anything.',
    editorNote: 'You will be able to see and edit the survey exactly as its owner does, apart from managing its admin list.',
    cta: 'Accept the invitation',
    signInNote: 'Sign in with the account for this email address to claim the access.',
    expiryNote: (d) => `This link is valid for ${d} days.`,
    fallbackNote: "If the button doesn't work, copy this link into your browser:",
  },
  he: {
    subject: (s) => `הוזמנת לנהל את הסקר "${s}" ב-Freedi`,
    greeting: 'שלום,',
    body: (inviter, survey, role) =>
      `${inviter} הזמין/ה אותך לנהל יחד את הסקר <strong>"${survey}"</strong> ב-Freedi בהרשאת <strong>${role}</strong>.`,
    roleViewer: 'צפייה בלבד',
    roleEditor: 'עריכה',
    viewerNote: 'תוכל/י לראות את כל מה שבעל/ת הסקר רואה — שאלות, תוצאות והשתתפות — אך לא לשנות דבר.',
    editorNote: 'תוכל/י לראות ולערוך את הסקר בדיוק כמו בעל/ת הסקר, למעט ניהול רשימת המנהלים.',
    cta: 'אישור ההזמנה',
    signInNote: 'יש להתחבר עם החשבון של כתובת הדוא"ל הזו כדי לקבל את ההרשאה.',
    expiryNote: (d) => `הקישור תקף ל-${d} ימים.`,
    fallbackNote: 'אם הכפתור אינו פועל, יש להעתיק את הקישור לדפדפן:',
  },
  ar: {
    subject: (s) => `تمت دعوتك لإدارة الاستطلاع "${s}" على Freedi`,
    greeting: 'مرحباً،',
    body: (inviter, survey, role) =>
      `دعاك ${inviter} للمشاركة في إدارة الاستطلاع <strong>"${survey}"</strong> على Freedi بصلاحية <strong>${role}</strong>.`,
    roleViewer: 'الاطلاع فقط',
    roleEditor: 'التحرير',
    viewerNote: 'ستتمكن من رؤية كل ما يراه مالك الاستطلاع — الأسئلة والنتائج والمشاركة — دون إمكانية التغيير.',
    editorNote: 'ستتمكن من عرض الاستطلاع وتحريره تماماً مثل مالكه، باستثناء إدارة قائمة المشرفين.',
    cta: 'قبول الدعوة',
    signInNote: 'يرجى تسجيل الدخول بالحساب المرتبط بهذا البريد الإلكتروني للحصول على الصلاحية.',
    expiryNote: (d) => `هذا الرابط صالح لمدة ${d} أيام.`,
    fallbackNote: 'إذا لم يعمل الزر، انسخ هذا الرابط إلى متصفحك:',
  },
  es: {
    subject: (s) => `Te han invitado a administrar "${s}" en Freedi`,
    greeting: 'Hola:',
    body: (inviter, survey, role) =>
      `${inviter} te ha invitado a coadministrar la encuesta <strong>"${survey}"</strong> en Freedi como <strong>${role}</strong>.`,
    roleViewer: 'observador',
    roleEditor: 'editor',
    viewerNote: 'Podrás ver todo lo que ve el propietario de la encuesta —preguntas, resultados y participación— pero no cambiar nada.',
    editorNote: 'Podrás ver y editar la encuesta igual que su propietario, salvo gestionar la lista de administradores.',
    cta: 'Aceptar la invitación',
    signInNote: 'Inicia sesión con la cuenta de esta dirección de correo para obtener el acceso.',
    expiryNote: (d) => `Este enlace es válido durante ${d} días.`,
    fallbackNote: 'Si el botón no funciona, copia este enlace en tu navegador:',
  },
  de: {
    subject: (s) => `Sie wurden eingeladen, „${s}" auf Freedi zu verwalten`,
    greeting: 'Hallo,',
    body: (inviter, survey, role) =>
      `${inviter} hat Sie eingeladen, die Umfrage <strong>„${survey}"</strong> auf Freedi als <strong>${role}</strong> mitzuverwalten.`,
    roleViewer: 'Betrachter',
    roleEditor: 'Bearbeiter',
    viewerNote: 'Sie sehen alles, was die Eigentümerin oder der Eigentümer der Umfrage sieht — Fragen, Ergebnisse und Teilnahme — können aber nichts ändern.',
    editorNote: 'Sie können die Umfrage genau wie die Eigentümerin oder der Eigentümer ansehen und bearbeiten, nur die Verwaltung der Administrationsliste bleibt ausgenommen.',
    cta: 'Einladung annehmen',
    signInNote: 'Melden Sie sich mit dem Konto dieser E-Mail-Adresse an, um den Zugriff zu erhalten.',
    expiryNote: (d) => `Dieser Link ist ${d} Tage gültig.`,
    fallbackNote: 'Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:',
  },
  nl: {
    subject: (s) => `Je bent uitgenodigd om "${s}" te beheren op Freedi`,
    greeting: 'Hallo,',
    body: (inviter, survey, role) =>
      `${inviter} heeft je uitgenodigd om de enquête <strong>"${survey}"</strong> op Freedi mee te beheren als <strong>${role}</strong>.`,
    roleViewer: 'kijker',
    roleEditor: 'bewerker',
    viewerNote: 'Je ziet alles wat de eigenaar van de enquête ziet — vragen, resultaten en deelname — maar je kunt niets wijzigen.',
    editorNote: 'Je kunt de enquête bekijken en bewerken net als de eigenaar, behalve het beheren van de beheerderslijst.',
    cta: 'Uitnodiging accepteren',
    signInNote: 'Log in met het account van dit e-mailadres om de toegang te krijgen.',
    expiryNote: (d) => `Deze link is ${d} dagen geldig.`,
    fallbackNote: 'Werkt de knop niet? Kopieer dan deze link naar je browser:',
  },
  fa: {
    subject: (s) => `شما برای مدیریت نظرسنجی «${s}» در Freedi دعوت شده‌اید`,
    greeting: 'سلام،',
    body: (inviter, survey, role) =>
      `${inviter} شما را برای هم‌مدیری نظرسنجی <strong>«${survey}»</strong> در Freedi با دسترسی <strong>${role}</strong> دعوت کرده است.`,
    roleViewer: 'مشاهده',
    roleEditor: 'ویرایش',
    viewerNote: 'شما هر آنچه را مالک نظرسنجی می‌بیند — پرسش‌ها، نتایج و مشارکت — خواهید دید، اما نمی‌توانید چیزی را تغییر دهید.',
    editorNote: 'شما می‌توانید نظرسنجی را دقیقاً مانند مالک آن ببینید و ویرایش کنید، به جز مدیریت فهرست مدیران.',
    cta: 'پذیرش دعوت',
    signInNote: 'برای دریافت دسترسی، با حساب مربوط به این نشانی ایمیل وارد شوید.',
    expiryNote: (d) => `این پیوند به مدت ${d} روز معتبر است.`,
    fallbackNote: 'اگر دکمه کار نکرد، این پیوند را در مرورگر خود کپی کنید:',
  },
};

function buildHtmlShell(innerHtml: string, language: EmailLanguage): string {
  const dir = RTL.includes(language) ? 'rtl' : 'ltr';
  const align = dir === 'rtl' ? 'right' : 'left';

  return `<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<body style="margin:0;padding:0;background:#f4f5f7;">
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#2d3748;max-width:600px;margin:0 auto;padding:24px;text-align:${align};" dir="${dir}">
    <div style="background:#ffffff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      ${innerHtml}
    </div>
    <p style="font-size:12px;color:#a0aec0;text-align:center;margin-top:18px;">Freedi</p>
  </div>
</body>
</html>`;
}

export interface SurveyAdminInvitationEmailParams {
  to: string;
  inviteLink: string;
  role: SurveyAdminRole;
  inviterName: string;
  surveyTitle: string;
  expiresAt: number;
  language?: string | null;
}

/**
 * Best-effort invitation email. The raw token exists only in the request that
 * minted it (the document stores its hash), so this MUST be called from that
 * request rather than from a background job.
 *
 * Never throws — a failed or skipped send leaves the invite usable through the
 * link returned to the inviting admin. Resolves `true` when a message was
 * handed to the transporter.
 */
export async function sendSurveyAdminInvitationEmail(
  params: SurveyAdminInvitationEmailParams
): Promise<boolean> {
  const transporter = getEmailTransporter();

  if (!transporter) {
    return false;
  }

  const language = toEmailLanguage(params.language);
  const s = STRINGS[language];
  const isEditor = params.role === SurveyAdminRole.editor;
  const roleLabel = isEditor ? s.roleEditor : s.roleViewer;
  const roleNote = isEditor ? s.editorNote : s.viewerNote;
  const survey = escapeHtml(params.surveyTitle);
  const inviter = escapeHtml(params.inviterName);
  const link = escapeHtml(params.inviteLink);
  const days = Math.max(1, Math.round((params.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));

  const inner = `
    <p style="font-size:16px;margin:0 0 16px;">${s.greeting}</p>
    <p style="font-size:16px;margin:0 0 16px;">${s.body(inviter, survey, roleLabel)}</p>
    <p style="font-size:15px;color:#4a5568;margin:0 0 16px;">${roleNote}</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${link}" style="background:#5f88e5;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;font-size:16px;">
        ${s.cta}
      </a>
    </div>
    <p style="font-size:14px;color:#718096;margin:0 0 8px;">${s.signInNote}</p>
    <p style="font-size:14px;color:#718096;margin:0 0 8px;">${s.expiryNote(days)}</p>
    <p style="font-size:13px;color:#a0aec0;margin:16px 0 0;">
      ${s.fallbackNote}<br />
      <a href="${link}" style="color:#4299e1;word-break:break-all;">${link}</a>
    </p>`;

  try {
    await transporter.sendMail({
      from: getFromAddress(),
      to: params.to,
      subject: s.subject(params.surveyTitle),
      html: buildHtmlShell(inner, language),
    });

    logger.info('[email] Survey admin invitation sent to', params.to);

    return true;
  } catch (error) {
    logger.error('[email] Failed to send survey admin invitation:', error);

    return false;
  }
}

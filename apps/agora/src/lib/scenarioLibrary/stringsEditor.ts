import type { LangCode } from '../i18n';

/**
 * What the scenario editor and the publish sheet say when a save is working, has
 * failed, or was refused: in the six languages, merged into the main table.
 */
export const libraryEditorStrings: Record<LangCode, Record<string, string>> = {
	he: {
		'editor.saving': 'שומרים…',
		'editor.title_required': 'צריך לתת לתרחיש שם לפני השמירה.',
		'editor.save_err': 'השמירה לא הצליחה, והשינויים שלכם עדיין כאן במסך. נסו שוב בעוד רגע.',
		'editor.save_err_denied': 'אי אפשר לשמור: התרחיש הזה לא שייך לחשבון הזה.',
		'editor.save_err_signin': 'צריך להתחבר מחדש כדי לשמור. השינויים עדיין כאן, ואל תרעננו את הדף.',
		'editor.save_err_network':
			'אין חיבור יציב לשרת, ולכן השמירה לא הושלמה. השינויים עדיין כאן. נסו שוב כשהחיבור חוזר.',
		'editor.save_err_missing': 'התרחיש הזה כבר לא קיים, ולכן אי אפשר לשמור אותו.',
		'editor.leave_failed': 'השמירה לא הצליחה, ולכן נשארתם בדף. השינויים שלכם עדיין כאן.',
		'editor.upload_err': 'הקובץ לא עלה ולא נוסף לתרחיש. בדקו את החיבור ונסו שוב.',
		'editor.file_too_big': 'הקובץ גדול מדי. אפשר עד {mb} מ״ב.',
		'scenlib.pub_err_state': 'אי אפשר לפרסם את התרחיש במצבו הנוכחי. ודאו שסימנתם אותו כמוכן.',
		'scenlib.pub_err_text':
			'השרת לא קיבל משהו בכרטיס הפרסום: הניסוח, התמונה או אחד התגיות. בדקו ונסו שוב.',
		'scenlib.pub_err_missing': 'התרחיש הזה כבר לא קיים.',
	},
	en: {
		'editor.saving': 'Saving…',
		'editor.title_required': 'Give the scenario a title before saving.',
		'editor.save_err':
			'Saving did not work, and your changes are still on the screen. Try again in a moment.',
		'editor.save_err_denied': 'Cannot save: this scenario does not belong to this account.',
		'editor.save_err_signin':
			'Please sign in again to save. Your changes are still here, so do not reload the page.',
		'editor.save_err_network':
			'There is no stable connection to the server, so the save did not finish. Your changes are still here. Try again when the connection is back.',
		'editor.save_err_missing': 'This scenario no longer exists, so it cannot be saved.',
		'editor.leave_failed':
			'Saving did not work, so you stayed on this page. Your changes are still here.',
		'editor.upload_err':
			'The file did not upload and was not added to the scenario. Check the connection and try again.',
		'editor.file_too_big': 'That file is too big. The limit is {mb} MB.',
		'scenlib.pub_err_state':
			'This scenario cannot be published as it is. Make sure it is marked ready.',
		'scenlib.pub_err_text':
			'The server did not accept something in the listing: the wording, the picture or a tag. Check them and try again.',
		'scenlib.pub_err_missing': 'This scenario no longer exists.',
	},
	ar: {
		'editor.saving': 'جارٍ الحفظ…',
		'editor.title_required': 'أعطوا السيناريو عنوانًا قبل الحفظ.',
		'editor.save_err': 'لم ينجح الحفظ، وتغييراتكم ما زالت على الشاشة. حاولوا مرة أخرى بعد قليل.',
		'editor.save_err_denied': 'لا يمكن الحفظ: هذا السيناريو لا يتبع هذا الحساب.',
		'editor.save_err_signin':
			'يجب تسجيل الدخول من جديد للحفظ. التغييرات ما زالت هنا، فلا تُحدّثوا الصفحة.',
		'editor.save_err_network':
			'لا يوجد اتصال مستقر بالخادم، فلم يكتمل الحفظ. التغييرات ما زالت هنا. حاولوا عندما يعود الاتصال.',
		'editor.save_err_missing': 'هذا السيناريو لم يعد موجودًا، فلا يمكن حفظه.',
		'editor.leave_failed': 'لم ينجح الحفظ، فبقيتم في هذه الصفحة. تغييراتكم ما زالت هنا.',
		'editor.upload_err':
			'لم يُرفع الملف ولم يُضَف إلى السيناريو. تحقّقوا من الاتصال وحاولوا مرة أخرى.',
		'editor.file_too_big': 'الملف كبير جدًا. الحد الأقصى {mb} ميغابايت.',
		'scenlib.pub_err_state':
			'لا يمكن نشر السيناريو بحالته الحالية. تأكّدوا من أنكم علّمتموه جاهزًا.',
		'scenlib.pub_err_text':
			'لم يقبل الخادم شيئًا في بطاقة النشر: الصياغة أو الصورة أو أحد الوسوم. تحقّقوا وحاولوا مرة أخرى.',
		'scenlib.pub_err_missing': 'هذا السيناريو لم يعد موجودًا.',
	},
	es: {
		'editor.saving': 'Guardando…',
		'editor.title_required': 'Póngale un título al escenario antes de guardar.',
		'editor.save_err':
			'No se pudo guardar, y sus cambios siguen en la pantalla. Inténtelo de nuevo en un momento.',
		'editor.save_err_denied': 'No se puede guardar: este escenario no pertenece a esta cuenta.',
		'editor.save_err_signin':
			'Vuelva a iniciar sesión para guardar. Sus cambios siguen aquí, así que no recargue la página.',
		'editor.save_err_network':
			'No hay una conexión estable con el servidor, así que el guardado no terminó. Sus cambios siguen aquí. Inténtelo cuando vuelva la conexión.',
		'editor.save_err_missing': 'Este escenario ya no existe, así que no se puede guardar.',
		'editor.leave_failed':
			'No se pudo guardar, así que se quedó en esta página. Sus cambios siguen aquí.',
		'editor.upload_err':
			'El archivo no se subió y no se añadió al escenario. Revise la conexión e inténtelo de nuevo.',
		'editor.file_too_big': 'El archivo es demasiado grande. El límite es {mb} MB.',
		'scenlib.pub_err_state':
			'Este escenario no se puede publicar tal como está. Compruebe que esté marcado como listo.',
		'scenlib.pub_err_text':
			'El servidor no aceptó algo de la ficha: el texto, la imagen o una etiqueta. Revíselos e inténtelo de nuevo.',
		'scenlib.pub_err_missing': 'Este escenario ya no existe.',
	},
	de: {
		'editor.saving': 'Wird gespeichert…',
		'editor.title_required': 'Geben Sie dem Szenario vor dem Speichern einen Titel.',
		'editor.save_err':
			'Das Speichern hat nicht geklappt, und Ihre Änderungen sind noch auf dem Bildschirm. Versuchen Sie es gleich noch einmal.',
		'editor.save_err_denied':
			'Speichern nicht möglich: Dieses Szenario gehört nicht zu diesem Konto.',
		'editor.save_err_signin':
			'Bitte melden Sie sich zum Speichern erneut an. Ihre Änderungen sind noch da, laden Sie die Seite also nicht neu.',
		'editor.save_err_network':
			'Es gibt keine stabile Verbindung zum Server, daher wurde das Speichern nicht abgeschlossen. Ihre Änderungen sind noch da. Versuchen Sie es erneut, wenn die Verbindung wieder da ist.',
		'editor.save_err_missing':
			'Dieses Szenario gibt es nicht mehr, daher kann es nicht gespeichert werden.',
		'editor.leave_failed':
			'Das Speichern hat nicht geklappt, deshalb sind Sie auf dieser Seite geblieben. Ihre Änderungen sind noch da.',
		'editor.upload_err':
			'Die Datei wurde nicht hochgeladen und dem Szenario nicht hinzugefügt. Prüfen Sie die Verbindung und versuchen Sie es erneut.',
		'editor.file_too_big': 'Die Datei ist zu groß. Das Limit liegt bei {mb} MB.',
		'scenlib.pub_err_state':
			'Dieses Szenario kann so nicht veröffentlicht werden. Prüfen Sie, ob es als bereit markiert ist.',
		'scenlib.pub_err_text':
			'Der Server hat etwas im Eintrag nicht akzeptiert: den Text, das Bild oder ein Tag. Prüfen Sie das und versuchen Sie es erneut.',
		'scenlib.pub_err_missing': 'Dieses Szenario gibt es nicht mehr.',
	},
	nl: {
		'editor.saving': 'Opslaan…',
		'editor.title_required': 'Geef het scenario een titel voordat u opslaat.',
		'editor.save_err':
			'Opslaan is niet gelukt en uw wijzigingen staan nog op het scherm. Probeer het zo meteen opnieuw.',
		'editor.save_err_denied': 'Opslaan kan niet: dit scenario hoort niet bij dit account.',
		'editor.save_err_signin':
			'Log opnieuw in om op te slaan. Uw wijzigingen staan er nog, dus laad de pagina niet opnieuw.',
		'editor.save_err_network':
			'Er is geen stabiele verbinding met de server, dus het opslaan is niet afgerond. Uw wijzigingen staan er nog. Probeer het opnieuw als de verbinding terug is.',
		'editor.save_err_missing':
			'Dit scenario bestaat niet meer, dus het kan niet worden opgeslagen.',
		'editor.leave_failed':
			'Opslaan is niet gelukt, daarom bleef u op deze pagina. Uw wijzigingen staan er nog.',
		'editor.upload_err':
			'Het bestand is niet geüpload en niet aan het scenario toegevoegd. Controleer de verbinding en probeer het opnieuw.',
		'editor.file_too_big': 'Dat bestand is te groot. De limiet is {mb} MB.',
		'scenlib.pub_err_state':
			'Dit scenario kan zo niet worden gepubliceerd. Controleer of het als klaar is gemarkeerd.',
		'scenlib.pub_err_text':
			'De server accepteerde iets in de vermelding niet: de tekst, de afbeelding of een label. Controleer het en probeer het opnieuw.',
		'scenlib.pub_err_missing': 'Dit scenario bestaat niet meer.',
	},
};

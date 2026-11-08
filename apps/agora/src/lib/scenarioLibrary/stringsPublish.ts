import type { LangCode } from '../i18n';

/** The publish sheet's progress and result words, in the six languages. Merged into the main table. */
export const libraryPublishStrings: Record<LangCode, Record<string, string>> = {
	he: {
		'scenlib.pub_working': 'מפרסמים בספרייה…',
		'scenlib.pub_wait_cover':
			'התמונה עדיין מצטיירת (בדרך כלל כחצי דקה, לכל היותר כשלוש דקות). הפרסום ייפתח כשהיא תהיה מוכנה.',
		'scenlib.pub_wait_upload': 'התמונה עדיין עולה. הפרסום ייפתח כשהיא תסתיים.',
		'scenlib.pub_cover_optional':
			'התמונה לא חובה: אפשר לפרסם גם בלעדיה ולהוסיף אותה אחר כך דרך עריכת הפרסום.',
		'scenlib.pub_err_denied': 'רק מורים שאושרו לספרייה יכולים לפרסם, והחשבון הזה עדיין לא אושר.',
		'scenlib.pub_err_signin': 'צריך להתחבר מחדש כדי לפרסם.',
		'scenlib.pub_err_network': 'אין חיבור יציב לשרת. התרחיש לא פורסם. נסו שוב בעוד רגע.',
		'scenlib.pub_err_server': 'תקלה אצלנו, והתרחיש לא פורסם. נסו שוב בעוד רגע.',
		'scenlib.notice_published_where':
			'התרחיש פורסם, והוא כבר מופיע בספרייה לכל המורים המאושרים. אין צורך באישור נוסף.',
		'scenlib.open_library': 'לפתיחת הספרייה',
	},
	en: {
		'scenlib.pub_working': 'Publishing to the library…',
		'scenlib.pub_wait_cover':
			'The picture is still being drawn (usually about half a minute, at most about three). Publishing unlocks when it is ready.',
		'scenlib.pub_wait_upload':
			'The picture is still uploading. Publishing unlocks when it is done.',
		'scenlib.pub_cover_optional':
			'The picture is optional: you can publish without one and add it later from the listing.',
		'scenlib.pub_err_denied':
			'Only teachers approved for the library can publish, and this account is not approved yet.',
		'scenlib.pub_err_signin': 'Please sign in again to publish.',
		'scenlib.pub_err_network':
			'The connection to the server is unstable. The scenario was not published. Try again in a moment.',
		'scenlib.pub_err_server':
			'Something went wrong on our side, and the scenario was not published. Try again in a moment.',
		'scenlib.notice_published_where':
			'Published. The scenario is already in the library for every approved teacher. No further review is needed.',
		'scenlib.open_library': 'Open the library',
	},
	ar: {
		'scenlib.pub_working': 'جارٍ النشر في المكتبة…',
		'scenlib.pub_wait_cover':
			'ما زالت الصورة قيد الرسم (عادةً نحو نصف دقيقة وبحد أقصى نحو ثلاث). سيُفتح النشر عندما تجهز.',
		'scenlib.pub_wait_upload': 'ما زالت الصورة قيد الرفع. سيُفتح النشر عند انتهائها.',
		'scenlib.pub_cover_optional':
			'الصورة اختيارية: يمكنكم النشر بدونها وإضافتها لاحقًا من تعديل النشر.',
		'scenlib.pub_err_denied':
			'لا ينشر في المكتبة إلا المعلمون المعتمدون، وهذا الحساب لم يُعتمد بعد.',
		'scenlib.pub_err_signin': 'سجّلوا الدخول من جديد للنشر.',
		'scenlib.pub_err_network': 'الاتصال بالخادم غير مستقر ولم يُنشر السيناريو. حاولوا بعد لحظة.',
		'scenlib.pub_err_server': 'حدث خلل من جهتنا ولم يُنشر السيناريو. حاولوا بعد لحظة.',
		'scenlib.notice_published_where':
			'تم النشر، والسيناريو موجود الآن في المكتبة لكل المعلمين المعتمدين. لا حاجة إلى مراجعة إضافية.',
		'scenlib.open_library': 'فتح المكتبة',
	},
	es: {
		'scenlib.pub_working': 'Publicando en la biblioteca…',
		'scenlib.pub_wait_cover':
			'La imagen aún se está creando (normalmente unos 30 segundos, como máximo unos tres minutos). Publicar se activará cuando esté lista.',
		'scenlib.pub_wait_upload': 'La imagen aún se está subiendo. Publicar se activará al terminar.',
		'scenlib.pub_cover_optional':
			'La imagen es opcional: puede publicar sin ella y añadirla después al editar la publicación.',
		'scenlib.pub_err_denied':
			'Solo los docentes aprobados para la biblioteca pueden publicar, y esta cuenta aún no está aprobada.',
		'scenlib.pub_err_signin': 'Vuelva a iniciar sesión para publicar.',
		'scenlib.pub_err_network':
			'La conexión con el servidor es inestable. El escenario no se publicó. Inténtelo de nuevo en un momento.',
		'scenlib.pub_err_server':
			'Algo falló por nuestra parte y el escenario no se publicó. Inténtelo de nuevo en un momento.',
		'scenlib.notice_published_where':
			'Publicado. El escenario ya está en la biblioteca para todos los docentes aprobados. No hace falta otra revisión.',
		'scenlib.open_library': 'Abrir la biblioteca',
	},
	de: {
		'scenlib.pub_working': 'Wird in der Bibliothek veröffentlicht…',
		'scenlib.pub_wait_cover':
			'Das Bild wird noch erstellt (meist etwa eine halbe Minute, höchstens etwa drei). Veröffentlichen wird frei, sobald es fertig ist.',
		'scenlib.pub_wait_upload':
			'Das Bild wird noch hochgeladen. Veröffentlichen wird frei, sobald es fertig ist.',
		'scenlib.pub_cover_optional':
			'Das Bild ist optional: Sie können ohne Bild veröffentlichen und es später beim Bearbeiten des Eintrags ergänzen.',
		'scenlib.pub_err_denied':
			'Nur für die Bibliothek freigeschaltete Lehrkräfte können veröffentlichen, und dieses Konto ist noch nicht freigeschaltet.',
		'scenlib.pub_err_signin': 'Bitte melden Sie sich zum Veröffentlichen erneut an.',
		'scenlib.pub_err_network':
			'Die Verbindung zum Server ist instabil. Das Szenario wurde nicht veröffentlicht. Versuchen Sie es gleich noch einmal.',
		'scenlib.pub_err_server':
			'Bei uns ist etwas schiefgelaufen, das Szenario wurde nicht veröffentlicht. Versuchen Sie es gleich noch einmal.',
		'scenlib.notice_published_where':
			'Veröffentlicht. Das Szenario ist jetzt für alle freigeschalteten Lehrkräfte in der Bibliothek. Eine weitere Prüfung ist nicht nötig.',
		'scenlib.open_library': 'Bibliothek öffnen',
	},
	nl: {
		'scenlib.pub_working': 'Bezig met publiceren in de bibliotheek…',
		'scenlib.pub_wait_cover':
			'De afbeelding wordt nog gemaakt (meestal een halve minuut, hooguit ongeveer drie). Publiceren komt vrij zodra ze klaar is.',
		'scenlib.pub_wait_upload':
			'De afbeelding wordt nog geüpload. Publiceren komt vrij zodra dat klaar is.',
		'scenlib.pub_cover_optional':
			'De afbeelding is optioneel: je kunt zonder publiceren en haar later toevoegen via het bewerken van de vermelding.',
		'scenlib.pub_err_denied':
			'Alleen docenten die voor de bibliotheek zijn goedgekeurd kunnen publiceren, en dit account is nog niet goedgekeurd.',
		'scenlib.pub_err_signin': 'Log opnieuw in om te publiceren.',
		'scenlib.pub_err_network':
			'De verbinding met de server is instabiel. Het scenario is niet gepubliceerd. Probeer het zo meteen opnieuw.',
		'scenlib.pub_err_server':
			'Er ging iets mis aan onze kant en het scenario is niet gepubliceerd. Probeer het zo meteen opnieuw.',
		'scenlib.notice_published_where':
			'Gepubliceerd. Het scenario staat nu in de bibliotheek voor alle goedgekeurde docenten. Er is geen extra controle nodig.',
		'scenlib.open_library': 'Bibliotheek openen',
	},
};

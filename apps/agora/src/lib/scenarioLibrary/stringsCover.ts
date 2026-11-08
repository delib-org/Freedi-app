import type { LangCode } from '../i18n';

/** The AI cover button's words (phase 3), in the six languages. Merged into the main table. */
export const libraryCoverStrings: Record<LangCode, Record<string, string>> = {
	he: {
		'scenlib.cover_ai': 'יצירת תמונה מתוכן התרחיש',
		'scenlib.cover_ai_again': 'תמונה אחרת',
		'scenlib.cover_ai_working': 'מציירים… זה לוקח כחצי דקה',
		'scenlib.cover_ai_hint':
			'התמונה נוצרת מהכותרת, מהתקציר ומשלבי התרחיש בלבד, בלי טקסט ובלי אנשים אמיתיים. אפשר גם לגרור תמונה משלכם.',
		'scenlib.cover_ai_left': 'נותרו {{n}} תמונות להיום',
		'scenlib.cover_ai_failed': 'לא הצלחנו ליצור תמונה. נסו שוב, או העלו תמונה משלכם.',
		'scenlib.cover_ai_limit': 'מיציתם את התמונות להיום. אפשר להעלות תמונה משלכם.',
		'scenlib.cover_ai_refused': 'לא ניתן לאייר את התרחיש הזה. העלו תמונה משלכם.',
		'scenlib.cover_ai_done': 'התמונה מוכנה. אפשר ליצור אחרת או להחליף בתמונה שלכם.',
	},
	en: {
		'scenlib.cover_ai': 'Make a picture from the scenario',
		'scenlib.cover_ai_again': 'Another picture',
		'scenlib.cover_ai_working': 'Drawing… this takes about half a minute',
		'scenlib.cover_ai_hint':
			'The picture is made from the title, summary and stages only, with no text and no real people. You can also drop in your own.',
		'scenlib.cover_ai_left': '{{n}} pictures left today',
		'scenlib.cover_ai_failed': 'We could not make a picture. Try again, or upload your own.',
		'scenlib.cover_ai_limit': 'You have used today’s pictures. You can upload your own.',
		'scenlib.cover_ai_refused': 'This scenario cannot be illustrated. Upload your own picture.',
		'scenlib.cover_ai_done': 'The picture is ready. Make another, or replace it with your own.',
	},
	ar: {
		'scenlib.cover_ai': 'إنشاء صورة من محتوى السيناريو',
		'scenlib.cover_ai_again': 'صورة أخرى',
		'scenlib.cover_ai_working': 'جارٍ الرسم… يستغرق نحو نصف دقيقة',
		'scenlib.cover_ai_hint':
			'تُنشأ الصورة من العنوان والملخّص ومراحل السيناريو فقط، بلا نصوص وبلا أشخاص حقيقيين. ويمكنكم أيضًا سحب صورتكم الخاصة.',
		'scenlib.cover_ai_left': 'تبقّى {{n}} صور لهذا اليوم',
		'scenlib.cover_ai_failed': 'تعذّر إنشاء الصورة. أعيدوا المحاولة أو ارفعوا صورتكم.',
		'scenlib.cover_ai_limit': 'استخدمتم صور اليوم. يمكنكم رفع صورتكم الخاصة.',
		'scenlib.cover_ai_refused': 'لا يمكن رسم صورة لهذا السيناريو. ارفعوا صورتكم الخاصة.',
		'scenlib.cover_ai_done': 'الصورة جاهزة. يمكنكم إنشاء أخرى أو استبدالها بصورتكم.',
	},
	es: {
		'scenlib.cover_ai': 'Crear una imagen del escenario',
		'scenlib.cover_ai_again': 'Otra imagen',
		'scenlib.cover_ai_working': 'Dibujando… tarda unos 30 segundos',
		'scenlib.cover_ai_hint':
			'La imagen se crea solo a partir del título, el resumen y las etapas, sin texto ni personas reales. También puede arrastrar la suya.',
		'scenlib.cover_ai_left': 'Quedan {{n}} imágenes hoy',
		'scenlib.cover_ai_failed': 'No pudimos crear la imagen. Inténtelo de nuevo o suba la suya.',
		'scenlib.cover_ai_limit': 'Ha usado las imágenes de hoy. Puede subir la suya.',
		'scenlib.cover_ai_refused': 'Este escenario no se puede ilustrar. Suba su propia imagen.',
		'scenlib.cover_ai_done': 'La imagen está lista. Cree otra o sustitúyala por la suya.',
	},
	de: {
		'scenlib.cover_ai': 'Bild aus dem Szenario erstellen',
		'scenlib.cover_ai_again': 'Ein anderes Bild',
		'scenlib.cover_ai_working': 'Wird gemalt … das dauert etwa eine halbe Minute',
		'scenlib.cover_ai_hint':
			'Das Bild entsteht nur aus Titel, Zusammenfassung und Phasen, ohne Text und ohne echte Personen. Sie können auch ein eigenes Bild hineinziehen.',
		'scenlib.cover_ai_left': 'Heute noch {{n}} Bilder',
		'scenlib.cover_ai_failed':
			'Das Bild konnte nicht erstellt werden. Versuchen Sie es erneut oder laden Sie ein eigenes hoch.',
		'scenlib.cover_ai_limit':
			'Die Bilder für heute sind aufgebraucht. Sie können ein eigenes hochladen.',
		'scenlib.cover_ai_refused':
			'Dieses Szenario lässt sich nicht illustrieren. Laden Sie ein eigenes Bild hoch.',
		'scenlib.cover_ai_done':
			'Das Bild ist fertig. Erstellen Sie ein weiteres oder ersetzen Sie es.',
	},
	nl: {
		'scenlib.cover_ai': 'Afbeelding maken van het scenario',
		'scenlib.cover_ai_again': 'Nog een afbeelding',
		'scenlib.cover_ai_working': 'Bezig met tekenen… dit duurt ongeveer een halve minuut',
		'scenlib.cover_ai_hint':
			'De afbeelding wordt alleen gemaakt van de titel, samenvatting en fasen, zonder tekst en zonder echte mensen. Je kunt ook je eigen afbeelding slepen.',
		'scenlib.cover_ai_left': 'Nog {{n}} afbeeldingen vandaag',
		'scenlib.cover_ai_failed':
			'De afbeelding kon niet worden gemaakt. Probeer opnieuw of upload je eigen.',
		'scenlib.cover_ai_limit': 'Je afbeeldingen voor vandaag zijn op. Je kunt je eigen uploaden.',
		'scenlib.cover_ai_refused':
			'Dit scenario kan niet worden geïllustreerd. Upload je eigen afbeelding.',
		'scenlib.cover_ai_done':
			'De afbeelding is klaar. Maak er nog een of vervang hem door je eigen.',
	},
};

/**
 * Arabic (Modern Standard). Lazy chunk — downloaded only by players who ask
 * for it. Plural address throughout (أنتم); every plural stem carries all six
 * CLDR forms: `_zero`, `_one`, `_two`, `_few`, `_many`, `_other`.
 */
const ar: Record<string, string> = {
	'lang.switch': 'اللغة',
	'app.loading': 'نرفع الأشرعة…',

	// Joins short lists (chips, values). Arabic takes its own comma.
	'common.listSeparator': '، ',
	'common.close': 'إغلاق',
	'common.saving': 'جارٍ الحفظ…',
	'common.sailing': 'نبحر…',

	// ---- the legs of the voyage (top bar + strip) ----
	'step.intro': 'المقدّمة',
	'step.compass': 'البوصلة',
	'step.elders': 'البحّارة',
	'step.map': 'الخريطة',
	'step.voyage': 'الإبحار',
	'step.summary': 'الخلاصة',
	'step.windsDetail': '{{done}}/{{total}} رياح',
	'step.crewDetail_zero': '{{count}} بحّارة',
	'step.crewDetail_one': 'بحّار واحد',
	'step.crewDetail_two': 'بحّاران',
	'step.crewDetail_few': '{{count}} بحّارة',
	'step.crewDetail_many': '{{count}} بحّارًا',
	'step.crewDetail_other': '{{count}} بحّار',
	'step.islandsDetail_zero': '{{count}} جزر',
	'step.islandsDetail_one': 'جزيرة واحدة',
	'step.islandsDetail_two': 'جزيرتان',
	'step.islandsDetail_few': '{{count}} جزر',
	'step.islandsDetail_many': '{{count}} جزيرةً',
	'step.islandsDetail_other': '{{count}} جزيرة',
	'step.sailedDetail': '{{done}}/{{total}} جزر',
	'progress.aria': 'مراحل الرحلة',
	'progress.status.done': 'اكتملت',
	'progress.status.current': 'أنتم هنا',
	'progress.status.open': 'مفتوحة',
	'progress.status.locked': 'لم تُفتح بعد',

	// ---- top bar ----
	'chrome.digestTitle': 'قصّة رحلتكم إلى بريدكم',
	'chrome.digestShort': 'بريد',
	'chrome.admin': 'الإدارة',
	'chrome.noAccount': 'بلا حساب',

	// ---- intro ----
	'intro.anonymousNote': 'تبحرون بلا حساب — تُحفظ الرحلة في هذا المتصفّح',
	'intro.signedInAs': 'متّصلون باسم {{name}}',
	'intro.googleButton': 'تسجيل الدخول عبر Google للإبحار',
	'intro.googleNote': 'يحفظ الحساب رحلتكم ويتيح لكم العودة إليها من جهاز آخر.',
	'intro.or': 'أو',
	'intro.anonymousButton': 'الدخول بلا حساب',
	'intro.anonymousHint':
		'لن نعرف من أنتم. تُحفظ الرحلة في هذا المتصفّح فقط — مسح السجلّ أو جهاز آخر يعني البدء من جديد.',
	'intro.privacyNote':
		'إجابات البوصلة ويوميّات الربّان خاصّة بكم. المواقف التي تحدّدونها تظهر للبحّارة الآخرين إلى جانب الاسم الأوّل فقط — لا البريد الإلكتروني أبدًا.',
	'intro.privacyLink': 'ما الذي يُحفظ ومن يرى ماذا',
	'intro.signInFailed': 'لم يكتمل تسجيل الدخول، لذا لم تدخلوا بعد.',
	'intro.signInRetry': 'حاولوا مرة أخرى',
	'intro.signInOrAnonymous': 'ويمكنكم أيضًا المتابعة بلا حساب بالضغط على الزرّ أعلاه.',
	'intro.signInInApp':
		'يبدو أنّ الرابط فُتح داخل متصفّح تطبيق آخر. افتحوه في Safari أو Chrome وحاولوا مرة أخرى.',

	// ---- compass ----
	'compass.windCounter': 'الريح {{index}} من {{total}}',
	'compass.chipsHint': 'اختاروا {{min}} على الأقلّ — كلّ ما يخاطبكم:',
	'compass.chipsAria': 'أزرار الإلهام',
	'compass.ownWords': 'وبكلماتكم:',
	'compass.ownWordsOptional': 'وبكلماتكم (اختياري):',
	'compass.ownWordsPlaceholder': 'اكتبوا بكلماتكم…',
	'compass.decideWind': 'ريح الحسم',
	'compass.decidePrompt':
		'حين لا يوجد حلّ جيّد، ما الذي ينبغي أن يرشدكم مع ذلك؟ اختاروا {{top}} قيم رئيسيّة، بالترتيب.',
	'compass.tooMany': 'اخترتم {{picked}} قيمًا — أزيلوا {{extra}} منها بالضغط عليها للمتابعة.',
	'compass.submit': 'ضُبطت بوصلتكم — لمتابعة الرحلة',
	'compass.incomplete':
		'أجيبوا عن كلّ ريح — {{min}} اختيارات إلهام أو بكلماتكم — واختاروا {{top}} قيم رئيسيّة.',
	'wind.doneByWords': 'أجبتم بكلماتكم — يمكنكم المتابعة',
	'wind.done': 'يمكنكم المتابعة',
	'wind.picked': 'اختير {{picked}} من {{target}}',

	// ---- crew ----
	'elders.title': 'البحّارة في انتظاركم',
	'elders.intro':
		'كلّ ربّان يحتاج إلى طاقم على ظهر السفينة. اختاروا {{range}} بحّارة يرافقونكم من جزيرة إلى جزيرة.',
	'elders.intro2':
		'لن يقرّر البحّارة بدلًا منكم — في كلّ جزيرة يمكنكم استشارتهم، وسيساعدونكم على رؤية المسألة من زوايا مختلفة.',
	'elders.noteLabel': 'من المهمّ أن تعرفوا:',
	'elders.note1a': 'هذه شخصيّات ذكاء اصطناعيّ مستوحاة من شخصيّات تاريخيّة —',
	'elders.note1strong': 'ليست أحزابًا ولا مرشّحين في الانتخابات',
	'elders.note1b':
		'. تحمل دائمًا علامة 📜، وتبحر منفصلةً عن سفن الأحزاب، ولا تؤثّر في مدى قربكم من أيّ حزب.',
	'elders.note2a': 'مواقفها',
	'elders.note2strong': 'إعادة بناء تقريبيّة',
	'elders.note2b':
		'ممّا قالته وكتبته في حياتها، لا اقتباس. بحّار صمت في موضوع ما — يصمت هنا أيضًا.',
	'elders.matchHint':
		'🧭 البحّارة الموسومون بـ«يناسب رياحكم» يتحدّثون عن قيم رتّبتموها في البوصلة. هذا ترتيب فحسب — الخيار كلّه لكم.',
	'elders.matchBadge': '🧭 يناسب رياحكم',
	'elders.matchBasisBoth':
		'🧭 رتّبنا البحّارة بحسب ما اخترتموه في البداية: {{chips}} — وبحسب القيم التي رتّبتموها. هذا ترتيب فحسب — الخيار كلّه لكم.',
	'elders.matchBasisChips':
		'🧭 رتّبنا البحّارة بحسب ما اخترتموه في البداية: {{chips}}. هذا ترتيب فحسب — الخيار كلّه لكم.',
	'elders.matchEchoes': 'يتحدّث عن: {{chips}}',
	'elders.aboard': '⚓ على متن السفينة',
	'elders.whoIs': 'من هو {{name}}؟',
	'elders.aboardCount': 'على المتن: {{chosen}} من {{max}}',
	'elders.crewFull': ' — اكتمل الطاقم',
	'elders.sailWith_zero': 'الإبحار مع {{count}} بحّارة — لفتح الخريطة',
	'elders.sailWith_one': 'الإبحار مع بحّار واحد — لفتح الخريطة',
	'elders.sailWith_two': 'الإبحار مع بحّارَين — لفتح الخريطة',
	'elders.sailWith_few': 'الإبحار مع {{count}} بحّارة — لفتح الخريطة',
	'elders.sailWith_many': 'الإبحار مع {{count}} بحّارًا — لفتح الخريطة',
	'elders.sailWith_other': 'الإبحار مع {{count}} بحّار — لفتح الخريطة',
	'elders.pickMore_zero': 'اختاروا {{count}} آخرين للمتابعة',
	'elders.pickMore_one': 'اختاروا واحدًا آخر للمتابعة',
	'elders.pickMore_two': 'اختاروا اثنين آخرين للمتابعة',
	'elders.pickMore_few': 'اختاروا {{count}} آخرين للمتابعة',
	'elders.pickMore_many': 'اختاروا {{count}} آخرين للمتابعة',
	'elders.pickMore_other': 'اختاروا {{count}} آخرين للمتابعة',
	'elders.canChange': 'يمكنكم تغيير الطاقم في أيّ مرحلة من الرحلة.',
	'elders.minCrew_zero':
		'الطاقم لا يقلّ عن {{count}} بحّارة. يمكنكم تغييره في أيّ مرحلة من الرحلة.',
	'elders.minCrew_one': 'الطاقم لا يقلّ عن بحّار واحد. يمكنكم تغييره في أيّ مرحلة من الرحلة.',
	'elders.minCrew_two': 'الطاقم لا يقلّ عن بحّارَين. يمكنكم تغييره في أيّ مرحلة من الرحلة.',
	'elders.minCrew_few': 'الطاقم لا يقلّ عن {{count}} بحّارة. يمكنكم تغييره في أيّ مرحلة من الرحلة.',
	'elders.minCrew_many':
		'الطاقم لا يقلّ عن {{count}} بحّارًا. يمكنكم تغييره في أيّ مرحلة من الرحلة.',
	'elders.minCrew_other':
		'الطاقم لا يقلّ عن {{count}} بحّار. يمكنكم تغييره في أيّ مرحلة من الرحلة.',

	// ---- map ----
	'map.hint':
		'لا جزيرة مختارة مسبقًا — الخيار كلّه لكم. يمكنكم اختيار جزر قليلة لرحلة قصيرة، أو أكثر لرحلة كاملة. لا يلزم المرور بكلّ الجزر.',
	'map.onRoute': '⚓ على المسار',
	'map.addToRoute': '＋ ضمّ إلى الرحلة',
	'map.whatIsHere': 'ما في هذه الجزيرة؟',
	'map.selectedCount': 'على المسار: {{selected}} من {{total}} جزر',
	'map.pickOne': 'اختاروا جزيرة واحدة على الأقلّ للإبحار',
	'map.sail_zero': 'نبحر إلى {{count}} جزر (~{{minutes}} دقيقة)',
	'map.sail_one': 'نبحر إلى جزيرة واحدة (~{{minutes}} دقيقة)',
	'map.sail_two': 'نبحر إلى جزيرتين (~{{minutes}} دقيقة)',
	'map.sail_few': 'نبحر إلى {{count}} جزر (~{{minutes}} دقيقة)',
	'map.sail_many': 'نبحر إلى {{count}} جزيرةً (~{{minutes}} دقيقة)',
	'map.sail_other': 'نبحر إلى {{count}} جزيرة (~{{minutes}} دقيقة)',

	// ---- voyage ----
	'voyage.defaultLogPrompt': 'ما الأهمّ لكم في هذه المسألة، أو أين يكمن تردّدكم؟',
	'voyage.islandCounter': 'الجزيرة {{index}} من {{total}}',
	'voyage.shoresIntro_zero':
		'أمامكم {{count}} شواطئ. حدّدوا موقفكم من كلّ شاطئ — يجب تحديد واحد على الأقلّ. لا حاجة إلى اختيار إجابة واحدة فقط.',
	'voyage.shoresIntro_one':
		'أمامكم شاطئ واحد. حدّدوا موقفكم منه — يجب تحديد واحد على الأقلّ. لا حاجة إلى اختيار إجابة واحدة فقط.',
	'voyage.shoresIntro_two':
		'أمامكم شاطئان. حدّدوا موقفكم من كلّ شاطئ — يجب تحديد واحد على الأقلّ. لا حاجة إلى اختيار إجابة واحدة فقط.',
	'voyage.shoresIntro_few':
		'أمامكم {{count}} شواطئ. حدّدوا موقفكم من كلّ شاطئ — يجب تحديد واحد على الأقلّ. لا حاجة إلى اختيار إجابة واحدة فقط.',
	'voyage.shoresIntro_many':
		'أمامكم {{count}} شاطئًا. حدّدوا موقفكم من كلّ شاطئ — يجب تحديد واحد على الأقلّ. لا حاجة إلى اختيار إجابة واحدة فقط.',
	'voyage.shoresIntro_other':
		'أمامكم {{count}} شاطئ. حدّدوا موقفكم من كلّ شاطئ — يجب تحديد واحد على الأقلّ. لا حاجة إلى اختيار إجابة واحدة فقط.',
	'voyage.shore': 'الشاطئ {{number}}',
	'voyage.earlierAnswer': 'إجابتكم السابقة — يمكنكم تغييرها',
	'voyage.attitudeGroup': 'الموقف من الشاطئ {{number}}',
	'voyage.logLabel': '📖 يوميّات الربّان:',
	'voyage.logPlaceholder': 'اختياري — تردّد، تحفّظ، أو أيّ شيء آخر تودّون قوله في المسألة',
	'voyage.continue': 'لمتابعة الرحلة ⛵',
	'voyage.markOne': 'حدّدوا موقفكم من شاطئ واحد على الأقلّ للمتابعة.',
	'voyage.shipsAround': 'السفن من حولكم',
	'voyage.litShipHint':
		'السفينة المضاءة في الوسط هي سفينتكم. اضغطوا على سفينة لتروا مدى قربها منكم، أو',
	'voyage.showAllShips': 'اعرضوا كلّ السفن',
	'voyage.seaReacts': 'البحر يستجيب لخياراتكم',
	'voyage.tapShip': 'اضغطوا على سفينة لتروا مدى قربها من مساركم.',
	'voyage.proximityNote': 'القرب رسوّ مؤقّت — لا حكم ولا تعليمات تصويت.',
	'voyage.toSummary': 'إلى خريطة رحلتكم 🗺️',
	'voyage.nextIsland': 'إلى الجزيرة التالية: {{title}} ⚓',
	'attitude.support': 'أؤيّد',
	'attitude.livewith': 'أستطيع التعايش معه',
	'attitude.oppose': 'أعارض',

	// ---- ships: the rows, the card, the sea chart ----
	'ships.band.near.title': 'قريبة من مساركم',
	'ships.band.middle.title': 'في منتصف الطريق',
	'ships.band.far.title': 'بعيدة عن مساركم',
	'ships.band.near.word': 'قريبة من مساركم',
	'ships.band.middle.word': 'في منتصف الطريق',
	'ships.band.far.word': 'بعيدة عن مساركم',
	'ships.band.near.sentence': 'تبحر قريبًا من مساركم',
	'ships.band.middle.sentence': 'تبحر في منتصف الطريق',
	'ships.band.far.sentence': 'تبحر بعيدًا عن مساركم',
	'ships.noData': 'لا تتوفّر بعد بيانات كافية عن مسارات السفن.',
	'ships.noRouteData': 'لا بيانات مسار بعد',
	'ships.notEnoughData': 'لا بيانات كافية بعد',
	'ships.proximity': 'قرب {{percent}}%',
	'ships.all': 'كلّ السفن',
	'ships.temporaryBerth': 'رسوّ مؤقّت — لا حكم ولا تعليمات تصويت.',
	'ships.seaAria': 'البحر حول قاربكم',
	'ships.yourBoat': 'قاربكم',
	'ships.pennantsAria': 'السفن في البحر',
	'ships.showNearest': 'عرض الأقرب {{nearest}} فقط',
	'ships.showMore_zero': 'عرض {{count}} سفن أخرى',
	'ships.showMore_one': 'عرض سفينة أخرى',
	'ships.showMore_two': 'عرض سفينتين أخريين',
	'ships.showMore_few': 'عرض {{count}} سفن أخرى',
	'ships.showMore_many': 'عرض {{count}} سفينةً أخرى',
	'ships.showMore_other': 'عرض {{count}} سفينة أخرى',

	// ---- the crew's counsel ----
	'counsel.silent': 'ليس لي ميل موثّق هنا. هنا أُصغي ولا أتكلّم.',
	'counsel.personaNote': '📜 شخصيّة ذكاء اصطناعيّ — إعادة بناء تقريبيّة، لا اقتباس ولا توصية تصويت',
	'counsel.valuesLine': 'ما يرشدني هنا: {{values}}. فكّروا أنتم أيضًا فيما يرشدكم.',
	'counsel.scope.island': 'مشورة في الجزيرة',
	'counsel.scope.shore': 'مشورة على الشاطئ',
	'counsel.leanHere': 'يميل إلى هذا الشاطئ',
	'counsel.leanShore': 'يميل إلى الشاطئ {{number}}',
	'counsel.aboutIsland': 'عن الجزيرة كلّها:',
	'counsel.noCrew': 'لا بحّارة على المتن بعد ·',
	'counsel.addCrew': 'لإضافة بحّارة',
	'counsel.islandCaption': '📜 استشيروا الطاقم في الجزيرة',
	'counsel.hint': 'اضغطوا على بحّار أو بحّارة',
	'counsel.islandRowAria': 'الطاقم — مشورة في الجزيرة',
	'counsel.shoreLine': '📜 استشارة عن الشاطئ {{number}}',
	'counsel.shoreRowAria': 'الطاقم — مشورة على الشاطئ {{number}}',
	'counsel.chevronClosed': '‹',
	'counsel.chevronOpen': '▾',
	'counsel.reactionsEyebrow': 'البحّارة يستجيبون · عن الشاطئ {{number}}',

	// ---- the strip of chosen islands ----
	'strip.summary':
		'🗺️ الجزر التي اخترتموها — استُكشفت {{sailed}} من {{total}} · الانتقال إلى جزيرة أخرى',
	'strip.nav': 'جزر الرحلة',
	'strip.status.done': 'استُكشفت',
	'strip.status.current': 'أنتم هنا',
	'strip.status.open': 'لم تُستكشف بعد',
	'strip.noNeedAll': 'لا يلزم المرور بكلّ الجزر.',
	'strip.finishHere': 'إنهاء الرحلة هنا ورؤية خريطة إبحاركم',

	// ---- summary ----
	'summary.gameNote':
		'السفن القريبة تبحر في مسار يشبه مساركم. القرب رسوّ مؤقّت — لا حكم ولا تعليمات تصويت.',
	'summary.shipsTitle': '🚢 السفن في الأفق',
	'summary.shipsIntro_zero':
		'لكلّ سفينة: قربها من مساركم بناءً على {{count}} جزر استكشفتموها. إمكانيّة رسوّ — لا بطاقة اقتراع.',
	'summary.shipsIntro_one':
		'لكلّ سفينة: قربها من مساركم بناءً على الجزيرة الواحدة التي استكشفتموها. إمكانيّة رسوّ — لا بطاقة اقتراع.',
	'summary.shipsIntro_two':
		'لكلّ سفينة: قربها من مساركم بناءً على الجزيرتين اللتين استكشفتموهما. إمكانيّة رسوّ — لا بطاقة اقتراع.',
	'summary.shipsIntro_few':
		'لكلّ سفينة: قربها من مساركم بناءً على {{count}} جزر استكشفتموها. إمكانيّة رسوّ — لا بطاقة اقتراع.',
	'summary.shipsIntro_many':
		'لكلّ سفينة: قربها من مساركم بناءً على {{count}} جزيرةً استكشفتموها. إمكانيّة رسوّ — لا بطاقة اقتراع.',
	'summary.shipsIntro_other':
		'لكلّ سفينة: قربها من مساركم بناءً على {{count}} جزيرة استكشفتموها. إمكانيّة رسوّ — لا بطاقة اقتراع.',
	'summary.howRoute': 'كيف يُحدَّد مسار سفينة؟',
	'summary.tie': 'المركز الأوّل مشترك: {{names}}',
	'summary.earlyEvidence': 'انطباع أوّليّ — مبنيّ على {{statements}} عبارات في {{islands}} جزر',
	'summary.band.near': 'قريبة من مساركم',
	'summary.band.middle': 'إمكانيّة رسوّ',
	'summary.band.far': 'تبتعد',
	'summary.noRouteData': 'لا بيانات مسار لهذه السفينة بعد',
	'summary.proximityIslands_zero': 'قرب {{percent}}% · {{count}} جزر',
	'summary.proximityIslands_one': 'قرب {{percent}}% · جزيرة واحدة',
	'summary.proximityIslands_two': 'قرب {{percent}}% · جزيرتان',
	'summary.proximityIslands_few': 'قرب {{percent}}% · {{count}} جزر',
	'summary.proximityIslands_many': 'قرب {{percent}}% · {{count}} جزيرةً',
	'summary.proximityIslands_other': 'قرب {{percent}}% · {{count}} جزيرة',
	'summary.journalTitle': '🧭 يوميّات رحلتكم',
	'summary.rankArrow': ' ← ',
	'summary.captainLog': 'يوميّات الربّان',
	'summary.companionsTitle': '⛵ يبحرون إلى جانبكم',
	'summary.similarRoute': 'مسار مشابه',
	'summary.differentRoute': 'مسار مختلف',
	'summary.noCompanions':
		'لا بحّارة آخرين في هذا البحر بعد. حين ينضمّون — سترون هنا من يبحر في مسار يشبه مساركم.',
	'summary.seaMapTitle': '🗺️ خريطة بحر الآراء',
	'summary.seaMapIntro':
		'سفينتكم في الوسط. كلّ سفينة حزب تبحر على مسافتها من مساركم عبر كلّ الجزر التي استكشفتموها — القريبة إلى جانب سفينتكم، والبعيدة في الأفق. اضغطوا على سفينة لتروا مدى قربها.',
	'summary.gatesTitle': '🏛️ بوّابات النقاش التي فُتحت لكم',
	'summary.gatesIntro': 'في الجزر التي استكشفتموها يمكنكم لقاء الآخرين والبحث معًا عن حلول.',
	'summary.backToDiscussion': 'العودة إلى النقاش',
	'summary.notOverTitle': '🧭 لم تنتهِ الرحلة — ثمّة جزر أخرى',
	'summary.moreIslands_zero':
		'استكشفتم {{visited}} جزر. {{count}} أخرى في انتظاركم على الخريطة، ويمكنكم العودة إليها في أيّ وقت — ستتحدّث خريطة الإبحار.',
	'summary.moreIslands_one':
		'استكشفتم {{visited}} جزر. جزيرة أخرى في انتظاركم على الخريطة، ويمكنكم العودة إليها في أيّ وقت — ستتحدّث خريطة الإبحار.',
	'summary.moreIslands_two':
		'استكشفتم {{visited}} جزر. جزيرتان أخريان في انتظاركم على الخريطة، ويمكنكم العودة إليهما في أيّ وقت — ستتحدّث خريطة الإبحار.',
	'summary.moreIslands_few':
		'استكشفتم {{visited}} جزر. {{count}} جزر أخرى في انتظاركم على الخريطة، ويمكنكم العودة إليها في أيّ وقت — ستتحدّث خريطة الإبحار.',
	'summary.moreIslands_many':
		'استكشفتم {{visited}} جزر. {{count}} جزيرةً أخرى في انتظاركم على الخريطة، ويمكنكم العودة إليها في أيّ وقت — ستتحدّث خريطة الإبحار.',
	'summary.moreIslands_other':
		'استكشفتم {{visited}} جزر. {{count}} جزيرة أخرى في انتظاركم على الخريطة، ويمكنكم العودة إليها في أيّ وقت — ستتحدّث خريطة الإبحار.',
	'summary.allVisited':
		'مررتم بكلّ الجزر. يمكنكم العودة إلى الخريطة في أيّ وقت وتغيير موقف في جزيرة استكشفتموها.',
	'summary.backToMap': '🗺️ العودة إلى الخريطة',
	'summary.crewLink': '📜 البحّارة الذين معكم',
	'summary.digestPrompt': 'أتودّون معرفة ما يجري في البحر حين لا تكونون هنا؟',
	'summary.digestLink': '📬 قصّة رحلتكم إلى بريدكم',

	// ---- how a ship's course is set ----
	'parties.stage': 'السفن',
	'parties.title': 'كيف يُحدَّد مسار سفينة',
	'parties.intro': 'القرب الذي ترونه حساب، لا رأي. هذا ما يدخل فيه.',
	'parties.methodTitle': 'الطريقة',
	'parties.method1a': 'يُعطى كلّ حزب درجة على',
	'parties.method1strong': 'كلّ شاطئ على حدة',
	'parties.method1b':
		'— إلى أيّ مدى يؤيّده أو يعارضه — بناءً على موادّ منشورة: البرنامج الانتخابيّ، التصويت في الكنيست والتصريحات الموثّقة. قربكم من سفينة هو متوسّط المسافة بين درجاتكم ودرجاتها، على الشواطئ التي حدّدتموها فقط.',
	'parties.method2':
		'تُحفظ لكلّ درجة أيضًا مصادرها ودرجة يقينها. الدرجة التي لم يُعثر لها على موقف منشور تُوسم كتقدير وتُعطى يقينًا منخفضًا — تُحتسب، لكنّها لا تدّعي المعرفة.',
	'parties.newTitle': 'وماذا عن حزب جديد؟',
	'parties.newIntro':
		'بعض أحزاب هذه الانتخابات أحدث من الأسئلة التي تطرحها الرحلة. لكلّ حالة قاعدة مختلفة:',
	'parties.rule1strong': 'الهيئة نفسها باسم جديد',
	'parties.rule1': '— يُحفظ المسار كما هو.',
	'parties.rule2strong': 'اتّحاد أحزاب قائمة',
	'parties.rule2': '— يُشتقّ المسار من المكوّن ذي التوثيق المتواصل والوزن الأكبر.',
	'parties.rule3strong': 'حزب جديد تمامًا',
	'parties.rule3':
		'— يُشتقّ المسار من التصريحات الموثّقة لقادته ومن انتمائهم الحزبيّ وتصويتهم في الماضي. هنا اليقين أدنى، وكثيرًا ما يُوسم كتقدير.',
	'parties.shipsTitle': 'السفن على الخريطة',
	'parties.footnote':
		'تعرض الخريطة الأحزاب المتنافسة اليوم. الحزب الذي تفكّك أو اتّحد لا يبحر هنا باسمه القديم، والقوائم التي لن تُحسم إلّا مع إغلاق باب الترشّح ستُضاف حين يكون ما يُقال عنها.',
	'parties.back': 'العودة إلى خريطة الإبحار',

	// ---- privacy ----
	'privacy.stage': 'الخصوصيّة',
	'privacy.title': 'خصوصيّتكم في الرحلة',
	'privacy.intro': 'الاستبيان السياسيّ أمر شخصيّ. هذا ما يُحفظ، ومن يرى ماذا، وما يمكن حذفه.',
	'privacy.whySignInTitle': 'لماذا يلزم تسجيل الدخول',
	'privacy.whySignIn1':
		'يفعل تسجيل الدخول ثلاثة أشياء: يحفظ رحلتكم بحيث يمكنكم العودة إليها من جهاز آخر، ويمنع الشخص نفسه من ملء الاستبيان مرّات عديدة — ما يجعل النتائج بلا قيمة — وينقل مواقفكم إلى الأغورا، كي لا تصلوا إلى النقاش غرباء بلا رأي.',
	'privacy.whySignIn2':
		'يمكنكم أيضًا الدخول بلا حساب. عندها لن نعرف من أنتم إطلاقًا، لكنّ الرحلة تُحفظ في هذا المتصفّح فقط: مسح السجلّ، أو نافذة خاصّة، أو جهاز آخر — وتبدأ الرحلة من جديد.',
	'privacy.storedTitle': 'ما الذي يُحفظ',
	'privacy.stored1': 'المواقف التي حدّدتموها على كلّ شاطئ — أؤيّد، أستطيع التعايش معه، أعارض.',
	'privacy.stored2': 'إجابات البوصلة، وترتيب القيم، ويوميّات الربّان التي كتبتموها.',
	'privacy.stored3': 'الجزر التي اخترتموها، ومتى دخلتم نقاشًا في الأغورا.',
	'privacy.stored4':
		'معرّف المستخدم، والاسم الأوّل فقط. إن سجّلتم الدخول عبر Google — عنوان البريد الإلكتروني أيضًا.',
	'privacy.whoSeesTitle': 'من يرى ماذا',
	'privacy.privateLabel': 'خاصّ تمامًا:',
	'privacy.privateBody':
		'إجابات البوصلة، وترتيب القيم، ويوميّات الربّان. تُحفظ في مستند رحلتكم، وأنتم وحدكم من يستطيع قراءته.',
	'privacy.visibleLabel': 'يراه البحّارة الآخرون:',
	'privacy.visibleA': 'المواقف التي حدّدتموها على الشواطئ، إلى جانب',
	'privacy.visibleStrong': 'الاسم الأوّل فقط',
	'privacy.visibleB':
		'. هكذا تُبنى قائمة «يبحرون إلى جانبكم» وخريطة بحر الآراء — فهما تقيسان المسافة بين الإجابات، ولذلك يلزم قراءة الإجابات.',
	'privacy.hiddenLabel': 'لا يُكشف لأحد:',
	'privacy.hiddenBody':
		'عنوان البريد الإلكتروني وصورة الملفّ الشخصيّ. لا يُحفظان مع الإجابات ولا يُعرضان في أيّ شاشة.',
	'privacy.useTitle': 'فيمَ يُستخدم',
	'privacy.useBody':
		'الرحلة أداة مدنيّة وبحثيّة. تُستخدم الإجابات لعرض خريطتكم الشخصيّة، وللنقاش في الأغورا، وللبحث في الخطاب العامّ — بصورة مجمّعة. لا تُباع البيانات، ولا تُنقل إلى معلنين، ولا تُستخدم لمخاطبتكم بدعاية.',
	'privacy.controlTitle': 'ما بين أيديكم',
	'privacy.controlBody':
		'يمكنكم تغيير أيّ موقف في أيّ وقت — تعودون إلى الجزيرة وتحدّدونه من جديد. يمكنكم طلب الحصول على كلّ البيانات المحفوظة عنكم، ويمكنكم طلب حذفها؛ وعندها نحذف إجاباتكم أيضًا من قاعدة البيانات البحثيّة.',
	'privacy.contactTitle': 'المسؤوليّة والتواصل',
	'privacy.contactLead': 'للأسئلة حول البيانات، أو طلب نسخة، أو طلب حذف:',
	'privacy.contactFallback':
		'للأسئلة حول البيانات، أو طلب نسخة، أو طلب حذف — تواصلوا مع مشغّلي اللعبة.',
	'privacy.back': 'العودة إلى مدخل الرحلة',

	// ---- a letter to the shipwrights ----
	'feedback.dock': 'رسالة إلى بُناة السفينة',
	'feedback.title': '🪶 رسالة إلى بُناة السفينة',
	'feedback.sent': 'انطلقت الرسالة ⛵',
	'feedback.thanksWithEmail': 'شكرًا. إن كان لدينا ما نجيب به، سنكتب إلى {{email}}.',
	'feedback.thanksNoEmail': 'شكرًا. كتبتم بلا عنوان، فلن نستطيع الردّ — لكنّ الرسالة وصلتنا.',
	'feedback.backToVoyage': 'العودة إلى الرحلة',
	'feedback.writeAnother': 'كتابة رسالة أخرى',
	'feedback.intro':
		'شيء تعطّل، أو شيء غير واضح، أو فكرة للتحسين — أخبرونا. نحن، الفريق الذي يبني اللعبة، نقرأ كلّ رسالة.',
	'feedback.messageLabel': 'ما الذي تودّون إخبارنا به؟',
	'feedback.messagePlaceholder':
		'مثلًا: الزرّ لم يستجب، هذا السؤال لم يكن واضحًا، تنقص جزيرة في الخريطة…',
	'feedback.emailLabel': 'بريد للردّ — اختياري',
	'feedback.emailPrefilled':
		'هذا العنوان الذي دخلتم به. يمكنكم حذفه — عندها لن نستطيع الردّ، لكنّ الرسالة ستصل.',
	'feedback.emailNote':
		'سنستخدم العنوان للردّ على هذه الرسالة فقط. لا يُرفق بإجاباتكم في الرحلة، ولا يُحفظ معها، ولا يُسلَّم لأحد.',
	'feedback.diagnostics':
		'تُرفق بالرسالة تفاصيل تقنيّة — الشاشة التي كنتم فيها، والمتصفّح، وحجم النافذة ومعرّف المستخدم — كي نستطيع إعادة إنتاج العطل. إجابات الرحلة لا تُرفق.',
	'feedback.sending': 'جارٍ الإرسال…',
	'feedback.send': 'إرسال الرسالة',
	'feedback.alsoA': 'يمكنكم أيضًا',
	'feedback.mailLink': 'الكتابة إلينا مباشرةً بالبريد',
	'feedback.alsoB': '.',
	'feedback.fail.tooShort': 'الرسالة قصيرة جدًّا — اكتبوا لنا قليلًا بعد.',
	'feedback.fail.tooLong': 'الرسالة طويلة جدًّا — اختصروها قليلًا وحاولوا مجدّدًا.',
	'feedback.fail.badEmail': 'لا يبدو العنوان صالحًا. صحّحوه، أو احذفوه للإرسال بلا ردّ.',
	'feedback.fail.limited':
		'عدّة رسائل متتالية — وصلت كلّها وسنقرأها كلّها. يمكنكم الكتابة مجدّدًا بعد ساعة.',
	'feedback.fail.failed': 'لم تنطلق الرسالة — حاولوا مجدّدًا بعد لحظة. ما كتبتموه ما زال هنا.',

	// ---- the email digest ----
	'digest.title': '📬 قصّة رحلتكم إلى بريدكم',
	'digest.intro':
		'ما جرى في البحر منذ نزلتم إلى الشاطئ: بحّارة جدد إلى جانبكم، ورياح انقلبت، وتحدٍّ من الحكماء — في ساعة تناسبكم.',
	'digest.loading': 'جارٍ التحميل…',
	'digest.cadenceAria': 'الوتيرة',
	'digest.cadence.none': 'بلا رسائل',
	'digest.cadence.every': 'كلّ تحديث',
	'digest.cadence.daily': 'مرّة في اليوم',
	'digest.cadence.multi': 'عدّة مرّات في اليوم',
	'digest.everyNote':
		'حالما يتحرّك شيء في البحر — يُفحص مرّة في الساعة، ويُرسل فقط حين يكون ثمّة جديد فعلًا.',
	'digest.whichHour': 'في أيّ ساعة؟',
	'digest.whichHours': 'في أيّ ساعات؟ (حتّى {{max}})',
	'digest.hoursAria': 'الساعات',
	'digest.saving': 'جارٍ الحفظ…',
	'digest.save': 'حفظ',
	'digest.saved': 'حُفظ ✓',
	'digest.saveFailed': 'فشل الحفظ — حاولوا مجدّدًا بعد لحظة.',

	// ---- the 2D opinion map ----
	'opinionMap.you': 'أنتم',
	'opinionMap.notEnough':
		'لا يوجد بعد ما يكفي من البحّارة ذوي الإجابات المشتركة لرسم خريطة الآراء.',
	'opinionMap.unreliable':
		'⚠️ التداخل بين المسارات ما زال ضئيلًا جدًّا لرسم خريطة موثوقة{{r}}. ستظهر الخريطة حين تتوفّر إجابات مشتركة أكثر.',
	'opinionMap.aria': 'خريطة آراء ثنائيّة الأبعاد: القرب بين النقاط يعني تشابه الإجابات',
	'opinionMap.scaleBar': 'مسافة {{unit}}',
	'opinionMap.fidelity':
		'القرب في الخريطة = تشابه الإجابات. ليس للمحاور اتّجاه أو معنى ثابت. دقّة الخريطة: r = {{r}} · الإجهاد {{stress}} · يحمل المحوران {{percent}}% من البنية.',

	// ---- no game seeded yet ----
	'noGame.title': 'البحر ما زال فارغًا',
	'noGame.bodyA': 'لم تُنشأ اللعبة بعد. إن كنتم مديرين — ادخلوا إلى شاشة',
	'noGame.adminLink': 'الإدارة',
	'noGame.bodyB': 'وأنشئوا اللعبة.',

	// ---- the sea stage (Phaser) — never mix digits into these ----
	'stage.myShip': 'سفينتكم',
	'stage.castle': 'مملكة الوصول',
	'stage.yourNorth': 'شمالكم',

	// ---- a nameless fellow sailor ----
	'sailor.guest': 'ضيف/ة',
};

export default ar;

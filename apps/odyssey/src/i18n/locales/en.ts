/**
 * English. Lazy chunk — downloaded only by players who ask for it.
 * Neutral "you" throughout; plural keys use CLDR `_one` / `_other`.
 */
const en: Record<string, string> = {
	'lang.switch': 'Language',
	'app.loading': 'Hoisting the sails…',

	// Joins short lists (chips, values). Arabic takes its own comma.
	'common.listSeparator': ', ',
	'common.close': 'Close',
	'common.saving': 'Saving…',
	'common.sailing': 'Setting sail…',

	// ---- the legs of the voyage (top bar + strip) ----
	'step.intro': 'Welcome',
	'step.compass': 'Compass',
	'step.elders': 'Crew',
	'step.map': 'Map',
	'step.voyage': 'Voyage',
	'step.summary': 'Summary',
	'step.windsDetail': '{{done}}/{{total}} winds',
	'step.crewDetail_one': 'One sailor',
	'step.crewDetail_other': '{{count}} sailors',
	'step.islandsDetail_one': 'One island',
	'step.islandsDetail_other': '{{count}} islands',
	'step.sailedDetail': '{{done}}/{{total}} islands',
	'progress.aria': 'Stages of the voyage',
	'progress.status.done': 'done',
	'progress.status.current': 'you are here',
	'progress.status.open': 'open',
	'progress.status.locked': 'not open yet',

	// ---- top bar ----
	'chrome.digestTitle': 'Your voyage story by email',
	'chrome.digestShort': 'Email',
	'chrome.admin': 'Admin',
	'chrome.noAccount': 'No account',

	// ---- intro ----
	'intro.anonymousNote': 'Sailing without an account — the voyage is saved in this browser',
	'intro.signedInAs': 'Signed in as {{name}}',
	'intro.googleButton': 'Sign in with Google to set sail',
	'intro.googleNote': 'An account saves your voyage and lets you return to it from another device.',
	'intro.or': 'or',
	'intro.anonymousButton': 'Enter without an account',
	'intro.anonymousHint':
		'We will not know who you are. The voyage is saved only in this browser — clearing history or switching devices starts over.',
	'intro.privacyNote':
		'Your compass answers and captain’s log are private. The positions you mark are visible to other sailors next to your first name only — never your email.',
	'intro.privacyLink': 'What is saved and who sees what',

	// ---- compass ----
	'compass.windCounter': 'Wind {{index}} of {{total}}',
	'compass.chipsHint': 'Pick at least {{min}} — everything that speaks to you:',
	'compass.chipsAria': 'Inspiration chips',
	'compass.ownWords': 'And in your own words:',
	'compass.ownWordsOptional': 'And in your own words (optional):',
	'compass.ownWordsPlaceholder': 'Write it in your own words…',
	'compass.decideWind': 'The Deciding Wind',
	'compass.decidePrompt':
		'When there is no good solution, what should still guide you? Pick your top {{top}} values, in order.',
	'compass.tooMany':
		'You picked {{picked}} values — tap {{extra}} of them to remove them and continue.',
	'compass.submit': 'Your compass is set — continue the voyage',
	'compass.incomplete':
		'Answer every wind — {{min}} inspiration picks or your own words — and pick your top {{top}} values.',
	'wind.doneByWords': 'Answered in your own words — you can continue',
	'wind.done': 'You can continue',
	'wind.picked': '{{picked}} of {{target}} picked',

	// ---- crew ----
	'elders.title': 'The sailors are waiting',
	'elders.intro':
		'Every captain needs a crew on deck. Choose {{range}} sailors to accompany you from island to island.',
	'elders.intro2':
		'The sailors will not decide for you — on every island you can consult them, and they will help you see the issue from different angles.',
	'elders.noteLabel': 'Good to know:',
	'elders.note1a': 'These are AI characters inspired by historical figures —',
	'elders.note1strong': 'not parties and not candidates in the election',
	'elders.note1b':
		'. They are always marked with 📜, sail apart from the party ships, and never affect how near you are to any party.',
	'elders.note2a': 'Their positions are',
	'elders.note2strong': 'an approximate reconstruction',
	'elders.note2b':
		'of what they said and wrote in their lifetime, not a quotation. A sailor who was silent on a subject stays silent here too.',
	'elders.matchHint':
		'🧭 Sailors marked “matches your winds” speak about values you ranked on the compass. That is only an order — the choice is entirely yours.',
	'elders.matchBadge': '🧭 Matches your winds',
	'elders.aboard': '⚓ Aboard',
	'elders.whoIs': 'Who is {{name}}?',
	'elders.aboardCount': 'Aboard: {{chosen}} of {{max}}',
	'elders.crewFull': ' — the crew is full',
	'elders.sailWith_one': 'Set sail with one sailor — open the map',
	'elders.sailWith_other': 'Set sail with {{count}} sailors — open the map',
	'elders.pickMore_one': 'Choose one more to continue',
	'elders.pickMore_other': 'Choose {{count}} more to continue',
	'elders.canChange': 'You can change the crew at any stage of the voyage.',
	'elders.minCrew_one':
		'A crew is at least one sailor. You can change it at any stage of the voyage.',
	'elders.minCrew_other':
		'A crew is at least {{count}} sailors. You can change it at any stage of the voyage.',

	// ---- map ----
	'map.hint':
		'No island is chosen in advance — the choice is entirely yours. Pick a few islands for a short voyage, or more for a full one. There is no need to visit every island.',
	'map.onRoute': '⚓ On the route',
	'map.addToRoute': '＋ Add to the voyage',
	'map.whatIsHere': 'What is on this island?',
	'map.selectedCount': 'On the route: {{selected}} of {{total}} islands',
	'map.pickOne': 'Choose at least one island to set sail',
	'map.sail_one': 'Sail to one island (~{{minutes}} min)',
	'map.sail_other': 'Sail to {{count}} islands (~{{minutes}} min)',

	// ---- voyage ----
	'voyage.defaultLogPrompt': 'What matters most to you in this issue, or where do you hesitate?',
	'voyage.islandCounter': 'Island {{index}} of {{total}}',
	'voyage.shoresIntro_one':
		'Before you is one shore. Mark your attitude to it — you must mark at least one. There is no need to pick a single answer.',
	'voyage.shoresIntro_other':
		'Before you are {{count}} shores. Mark your attitude to each — you must mark at least one. There is no need to pick a single answer.',
	'voyage.shore': 'Shore {{number}}',
	'voyage.earlierAnswer': 'Your earlier answer — you can change it',
	'voyage.attitudeGroup': 'Attitude to shore {{number}}',
	'voyage.logLabel': '📖 Captain’s log:',
	'voyage.logPlaceholder':
		'Optional — a hesitation, a reservation, or anything else you still want to say about the issue',
	'voyage.continue': 'Continue the voyage ⛵',
	'voyage.markOne': 'Mark your attitude to at least one shore to continue.',
	'voyage.shipsAround': 'The ships around you',
	'voyage.litShipHint':
		'The lit ship in the centre is yours. Tap a ship to see how near it is to you, or',
	'voyage.showAllShips': 'show all the ships',
	'voyage.seaReacts': 'The sea responds to your choices',
	'voyage.tapShip': 'Tap a ship to see how near it sails to your route.',
	'voyage.proximityNote':
		'Nearness is a temporary berth — not a verdict and not a voting instruction.',
	'voyage.toSummary': 'To your voyage map 🗺️',
	'voyage.nextIsland': 'Next island: {{title}} ⚓',
	'attitude.support': 'Support',
	'attitude.livewith': 'Can live with it',
	'attitude.oppose': 'Oppose',

	// ---- ships: the rows, the card, the sea chart ----
	'ships.band.near.title': 'Near your route',
	'ships.band.middle.title': 'Midway',
	'ships.band.far.title': 'Far from your route',
	'ships.band.near.word': 'near your route',
	'ships.band.middle.word': 'midway',
	'ships.band.far.word': 'far from your route',
	'ships.band.near.sentence': 'sails near your route',
	'ships.band.middle.sentence': 'sails midway',
	'ships.band.far.sentence': 'sails far from your route',
	'ships.noData': 'Not enough data yet on the ships’ routes.',
	'ships.noRouteData': 'No route data yet',
	'ships.notEnoughData': 'not enough data yet',
	'ships.proximity': '{{percent}}% near',
	'ships.all': 'All the ships',
	'ships.temporaryBerth': 'A temporary berth — not a verdict and not a voting instruction.',
	'ships.seaAria': 'The sea around your boat',
	'ships.yourBoat': 'Your boat',
	'ships.pennantsAria': 'The ships on the sea',
	'ships.showNearest': 'Show only the {{nearest}} nearest',
	'ships.showMore_one': 'Show one more ship',
	'ships.showMore_other': 'Show {{count}} more ships',

	// ---- the crew's counsel ----
	'counsel.silent': 'I have no documented lean here. Here I listen rather than speak.',
	'counsel.personaNote':
		'📜 AI character — an approximate reconstruction, not a quotation and not a voting recommendation',
	'counsel.valuesLine': 'What guides me here: {{values}}. Consider what guides you.',
	'counsel.scope.island': 'Counsel on the island',
	'counsel.scope.shore': 'Counsel on the shore',
	'counsel.leanHere': 'Leans toward this shore',
	'counsel.leanShore': 'Leans toward shore {{number}}',
	'counsel.aboutIsland': 'On the island as a whole:',
	'counsel.noCrew': 'No sailors aboard yet ·',
	'counsel.addCrew': 'add sailors',
	'counsel.islandCaption': '📜 Consult the crew about the island',
	'counsel.hint': 'Tap a sailor',
	'counsel.islandRowAria': 'The crew — counsel on the island',
	'counsel.shoreLine': '📜 Consult about shore {{number}}',
	'counsel.shoreRowAria': 'The crew — counsel on shore {{number}}',
	'counsel.chevronClosed': '›',
	'counsel.chevronOpen': '▾',
	'counsel.reactionsEyebrow': 'The sailors respond · on shore {{number}}',

	// ---- the strip of chosen islands ----
	'strip.summary': '🗺️ Your islands — {{sailed}} of {{total}} explored · go to another island',
	'strip.nav': 'The islands of the voyage',
	'strip.status.done': 'explored',
	'strip.status.current': 'you are here',
	'strip.status.open': 'not yet explored',
	'strip.noNeedAll': 'There is no need to visit every island.',
	'strip.finishHere': 'End the voyage here and see your voyage map',

	// ---- summary ----
	'summary.gameNote':
		'Nearby ships sail a route similar to yours. Nearness is a temporary berth — not a verdict and not a voting instruction.',
	'summary.shipsTitle': '🚢 The ships on the horizon',
	'summary.shipsIntro_one':
		'For every ship: how near it sails to your route, based on the one island you explored. A possible berth — not a ballot.',
	'summary.shipsIntro_other':
		'For every ship: how near it sails to your route, based on the {{count}} islands you explored. A possible berth — not a ballot.',
	'summary.howRoute': 'How is a ship’s course set?',
	'summary.tie': 'Shared first place: {{names}}',
	'summary.earlyEvidence':
		'A first impression — based on {{statements}} statements on {{islands}} islands',
	'summary.band.near': 'near your route',
	'summary.band.middle': 'a possible berth',
	'summary.band.far': 'drifting away',
	'summary.noRouteData': 'No route data for this ship yet',
	'summary.proximityIslands_one': '{{percent}}% near · one island',
	'summary.proximityIslands_other': '{{percent}}% near · {{count}} islands',
	'summary.journalTitle': '🧭 Your voyage journal',
	'summary.rankArrow': ' → ',
	'summary.captainLog': 'Captain’s log',
	'summary.companionsTitle': '⛵ Sailing beside you',
	'summary.similarRoute': 'similar route',
	'summary.differentRoute': 'different route',
	'summary.noCompanions':
		'No other sailors on this sea yet. When they join, you will see here who sails a route similar to yours.',
	'summary.seaMapTitle': '🗺️ The sea of opinions',
	'summary.seaMapIntro':
		'Your ship is at the centre. Each party ship sails at its own distance from your route across every island you explored — the near ones beside your ship, the far ones on the horizon. Tap a ship to see how near it is.',
	'summary.gatesTitle': '🏛️ Discussion gates opened for you',
	'summary.gatesIntro':
		'On the islands you have already explored you can meet others and look for solutions together.',
	'summary.backToDiscussion': 'Back to the discussion',
	'summary.notOverTitle': '🧭 The voyage is not over — there are more islands',
	'summary.moreIslands_one':
		'You explored {{visited}} islands. One more is waiting on the map, and you can return to it at any time — the voyage map will update.',
	'summary.moreIslands_other':
		'You explored {{visited}} islands. {{count}} more are waiting on the map, and you can return to them at any time — the voyage map will update.',
	'summary.allVisited':
		'You visited every island. You can return to the map at any time and change a position on an island you already explored.',
	'summary.backToMap': '🗺️ Back to the map',
	'summary.crewLink': '📜 The sailors with you',
	'summary.digestPrompt': 'Want to know what happens at sea while you are away?',
	'summary.digestLink': '📬 Your voyage story by email',

	// ---- how a ship's course is set ----
	'parties.stage': 'The ships',
	'parties.title': 'How a ship’s course is set',
	'parties.intro':
		'The nearness you see is a calculation, not an opinion. This is what goes into it.',
	'parties.methodTitle': 'The method',
	'parties.method1a': 'Every party is scored on',
	'parties.method1strong': 'each shore separately',
	'parties.method1b':
		'— how far it supports or opposes it — from published material: platforms, Knesset votes and documented statements. Your nearness to a ship is the average distance between your scores and its own, on the shores you marked only.',
	'parties.method2':
		'Each score also keeps its sources and a confidence level. A score for which no published position was found is marked as an estimate and given low confidence — it counts, but it does not pretend to be knowledge.',
	'parties.newTitle': 'And what about a new party?',
	'parties.newIntro':
		'Some of the parties in this election are younger than the questions the voyage asks. Each case has its own rule:',
	'parties.rule1strong': 'The same body under a new name',
	'parties.rule1': '— the course is kept as it is.',
	'parties.rule2strong': 'A merger of existing parties',
	'parties.rule2':
		'— the course is derived from the component with the longest continuous record and the greatest weight.',
	'parties.rule3strong': 'An entirely new party',
	'parties.rule3':
		'— the course is derived from documented statements by its leaders and from their past party affiliation and votes. Here the confidence is lower, and often marked as an estimate.',
	'parties.shipsTitle': 'The ships on the map',
	'parties.footnote':
		'The map shows the parties running today. A party that dissolved or merged does not sail here under its old name, and lists that will only be final when registration closes will be added once there is something to say about them.',
	'parties.back': 'Back to the voyage map',

	// ---- privacy ----
	'privacy.stage': 'Privacy',
	'privacy.title': 'Your privacy on the voyage',
	'privacy.intro':
		'A political questionnaire is a personal thing. This is what is saved, who sees what, and what can be deleted.',
	'privacy.whySignInTitle': 'Why sign in',
	'privacy.whySignIn1':
		'Signing in does three things: it saves your voyage so you can return to it from another device, it stops one person filling in the questionnaire many times — which would make the findings worthless — and it carries your positions into the Agora, so you do not arrive at the discussion as strangers with no opinion.',
	'privacy.whySignIn2':
		'You can also enter without an account. Then we will not know who you are at all, but the voyage is saved only in this browser: clear your history, open a private window or switch devices — and the voyage starts over.',
	'privacy.storedTitle': 'What is saved',
	'privacy.stored1': 'The positions you marked on each shore — support, can live with it, oppose.',
	'privacy.stored2':
		'Your compass answers, your ranking of values and the captain’s log you wrote.',
	'privacy.stored3': 'The islands you chose, and when you entered a discussion in the Agora.',
	'privacy.stored4':
		'A user id, and your first name only. If you signed in with Google — your email address too.',
	'privacy.whoSeesTitle': 'Who sees what',
	'privacy.privateLabel': 'Entirely private:',
	'privacy.privateBody':
		'Your compass answers, your ranking of values and the captain’s log. They are kept in your voyage document, and only you can read it.',
	'privacy.visibleLabel': 'Visible to other sailors:',
	'privacy.visibleA': 'The positions you marked on the shores, next to',
	'privacy.visibleStrong': 'your first name only',
	'privacy.visibleB':
		'. That is how the “Sailing beside you” list and the sea of opinions are built — they measure the distance between answers, and for that the answers have to be read.',
	'privacy.hiddenLabel': 'Shown to no one:',
	'privacy.hiddenBody':
		'Your email address and profile picture. They are not saved on your answers and are not shown on any screen.',
	'privacy.useTitle': 'What it is used for',
	'privacy.useBody':
		'The voyage is a civic and research tool. The answers are used to show your personal map, for the discussion in the Agora, and for research on public discourse — in aggregate. The data is not sold, not passed to advertisers, and not used to target you with propaganda.',
	'privacy.controlTitle': 'What is in your hands',
	'privacy.controlBody':
		'You can change any position at any time — return to the island and mark it again. You can ask for all the data saved about you, and you can ask for it to be deleted; in that case we also delete your answers from the research dataset.',
	'privacy.contactTitle': 'Responsibility and contact',
	'privacy.contactLead': 'For questions about your data, a copy or a deletion request:',
	'privacy.contactFallback':
		'For questions about your data, a copy or a deletion request — contact the game’s operators.',
	'privacy.back': 'Back to the start of the voyage',

	// ---- a letter to the shipwrights ----
	'feedback.dock': 'A letter to the shipwrights',
	'feedback.title': '🪶 A letter to the shipwrights',
	'feedback.sent': 'The letter is on its way ⛵',
	'feedback.thanksWithEmail':
		'Thank you. If we have something to answer, we will write to {{email}}.',
	'feedback.thanksNoEmail':
		'Thank you. You wrote without an address, so we cannot reply — but the letter reached us.',
	'feedback.backToVoyage': 'Back to the voyage',
	'feedback.writeAnother': 'Write another letter',
	'feedback.intro':
		'Something broke, something is unclear, or an idea for improvement — tell us. We, the team building the game, read every letter.',
	'feedback.messageLabel': 'What would you like to tell us?',
	'feedback.messagePlaceholder':
		'For example: the button did not respond, this question was unclear, an island is missing from the map…',
	'feedback.emailLabel': 'Email for a reply — optional',
	'feedback.emailPrefilled':
		'This is the address you signed in with. You can delete it — then we cannot reply, but the letter will arrive.',
	'feedback.emailNote':
		'We will use the address only to answer this letter. It is not attached to your voyage answers, not stored with them and not given to anyone.',
	'feedback.diagnostics':
		'Technical details ride along with the letter — the screen you were on, the browser, the window size and your user id — so we can reproduce a fault. Your voyage answers are not attached.',
	'feedback.sending': 'Sending…',
	'feedback.send': 'Send the letter',
	'feedback.alsoA': 'You can also',
	'feedback.mailLink': 'write to us directly by email',
	'feedback.alsoB': '.',
	'feedback.fail.tooShort': 'The message is too short — write us a little more.',
	'feedback.fail.tooLong': 'The message is too long — shorten it a little and try again.',
	'feedback.fail.badEmail':
		'The address does not look valid. Fix it, or delete it to send without a reply.',
	'feedback.fail.limited':
		'Several letters in a row — they all arrived and we will read them all. You can write again in an hour.',
	'feedback.fail.failed':
		'The letter did not go out — try again in a moment. What you wrote is still here.',

	// ---- the email digest ----
	'digest.title': '📬 Your voyage story by email',
	'digest.intro':
		'What happened at sea since you went ashore: new sailors beside you, winds that turned, and a challenge from the elders — at an hour that suits you.',
	'digest.loading': 'Loading…',
	'digest.cadenceAria': 'Frequency',
	'digest.cadence.none': 'No emails',
	'digest.cadence.every': 'Every update',
	'digest.cadence.daily': 'Once a day',
	'digest.cadence.multi': 'A few times a day',
	'digest.everyNote':
		'As soon as something moves at sea — checked once an hour, and sent only when there is really news.',
	'digest.whichHour': 'At what hour?',
	'digest.whichHours': 'At which hours? (up to {{max}})',
	'digest.hoursAria': 'Hours',
	'digest.saving': 'Saving…',
	'digest.save': 'Save',
	'digest.saved': 'Saved ✓',
	'digest.saveFailed': 'Saving failed — try again in a moment.',

	// ---- the 2D opinion map ----
	'opinionMap.you': 'You',
	'opinionMap.notEnough': 'Not enough sailors with shared answers yet to draw the opinion map.',
	'opinionMap.unreliable':
		'⚠️ The overlap between routes is still too thin to draw a reliable map{{r}}. The map will appear when there are more shared answers.',
	'opinionMap.aria': 'Two-dimensional opinion map: nearness between points means similar answers',
	'opinionMap.scaleBar': 'distance {{unit}}',
	'opinionMap.fidelity':
		'Nearness on the map = similar answers. The axes have no direction or fixed meaning. Map fidelity: r = {{r}} · stress {{stress}} · the two axes carry {{percent}}% of the structure.',

	// ---- no game seeded yet ----
	'noGame.title': 'The sea is still empty',
	'noGame.bodyA': 'The game has not been set up yet. If you are an admin — go to the',
	'noGame.adminLink': 'admin screen',
	'noGame.bodyB': 'and create the game.',

	// ---- the sea stage (Phaser) — never mix digits into these ----
	'stage.myShip': 'Your ship',
	'stage.castle': 'The Kingdom of Arrival',
	'stage.yourNorth': 'Your north',

	// ---- a nameless fellow sailor ----
	'sailor.guest': 'Guest',
};

export default en;

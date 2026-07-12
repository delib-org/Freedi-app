import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	AgoraTopicStatus,
	functionConfig,
	getRandomUID,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { logError } from '../utils/errorHandling';
import { callLLM, extractJson, TAXONOMY_MODEL } from '../config/openai-chat';
import { FIXTURE_TOPIC_PACKAGE } from './fixtureTopicPackage';

interface Request {
	topic: string;
	language: string;
}

interface Result {
	topicPackageId: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
	he: 'Hebrew',
	en: 'English',
	ar: 'Arabic',
	es: 'Spanish',
	de: 'German',
	nl: 'Dutch',
};

function buildPrompt(topic: string, language: string): { system: string; user: string } {
	const languageName = LANGUAGE_NAMES[language] ?? 'English';

	const system = `You author a complete "topic package" for a classroom deliberative time-travel game. Students visit a historical dilemma, meet TWO opposing characters, hear each side's positions, then ask both sides "what do you actually need?" and hear the human needs beneath the positions (empathy before solutions), identify their values, position themselves between the camps, and deliberate solutions.

Respond ONLY with JSON matching exactly this shape (all content text in ${languageName}):
{
  "title": string,                       // era title with year(s)
  "framingText": string,                 // 2-3 sentence "save the era" mission briefing, second person plural
  "characters": [                        // EXACTLY 2, opposing camps
    {
      "characterId": "char-a" | "char-b",
      "name": string, "role": string,
      "arguments": string[3],            // spoken, first person
      "needs": string[3],                // first person: the human needs BENEATH the positions (safety, dignity, being heard...) — not restated demands
      "values": [{"valueId": string, "label": string, "description": string}]  // exactly 3, the answer key
    }
  ],
  "positioningScale": {"leftLabel": string, "rightLabel": string, "leftCharacterId": "char-a", "rightCharacterId": "char-b"},
  "challengeQuestion": string,           // the deliberation prompt: build a solution acceptable to both camps
  "plausibilityRubric": {"criteria": [{"criterionId": string, "label": string, "description": string, "weight": number}]},  // 3 criteria, weights sum to 1
  "healthMetrics": [{"metricId": string, "label": string, "description": string, "min": 0, "max": 100, "baseline": number, "higherIsBetter": boolean}],  // exactly 4 national wellbeing gauges
  "scenes": [                            // EXACTLY 10, kinds in this order:
    {"sceneId": string, "kind": "intro", "title": string, "text": string},
    {"sceneId": string, "kind": "timeTunnel", "title": string, "text": string},
    {"sceneId": string, "kind": "periodExplainer", "title": string, "text": string},   // rich, accurate historical context
    {"sceneId": string, "kind": "perspectiveA", "title": string, "text": string, "dialogue": [{"speaker": string, "line": string}]},  // 3 lines by character A
    {"sceneId": string, "kind": "perspectiveB", "title": string, "text": string, "dialogue": [{"speaker": string, "line": string}]},  // 3 lines by character B
    {"sceneId": string, "kind": "needsQuestion", "title": string, "text": string},     // the class turns to both sides and asks: beyond your positions, what do you actually NEED?
    {"sceneId": string, "kind": "needsA", "title": string, "text": string, "dialogue": [{"speaker": string, "line": string}]},  // 3 lines: character A opens up about their needs (vulnerable, human, mirrors characters[0].needs)
    {"sceneId": string, "kind": "needsB", "title": string, "text": string, "dialogue": [{"speaker": string, "line": string}]},  // 3 lines: character B opens up about their needs (mirrors characters[1].needs)
    {"sceneId": string, "kind": "successEnding", "title": string, "text": string},
    {"sceneId": string, "kind": "failureEnding", "title": string, "text": string}      // hopeful, invites retry
  ]
}
Historical accuracy matters — a teacher will review. Age-appropriate for ages 12-18. Both characters must be sympathetic, never straw men. In the needs scenes the characters drop the rhetoric and speak as vulnerable humans — this is where students learn that rivals have understandable needs.`;

	const user = `Topic: ${topic}`;

	return { system, user };
}

/**
 * Teacher enters a topic; the AI drafts the entire package for review.
 * Fixture mode (no OPENAI_API_KEY) returns the bundled French Revolution
 * package so emulators/e2e/CI are deterministic.
 */
export const agoraGenerateTopicPackage = onCall(
	{ region: functionConfig.region, timeoutSeconds: 300 },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
		}

		const { topic, language } = request.data ?? {};
		if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
			throw new HttpsError('invalid-argument', 'topic is required');
		}
		const lang = typeof language === 'string' && language ? language : 'en';

		try {
			const topicPackageId = getRandomUID();
			const now = Date.now();
			let draft: Record<string, unknown>;

			if (process.env.OPENAI_API_KEY) {
				const { system, user } = buildPrompt(topic.trim(), lang);
				const raw = await callLLM({
					model: TAXONOMY_MODEL,
					system,
					user,
					maxTokens: 6000,
					temperature: 0.6,
					jsonMode: true,
				});
				draft = JSON.parse(extractJson(raw)) as Record<string, unknown>;
			} else {
				draft = { ...FIXTURE_TOPIC_PACKAGE, title: `${FIXTURE_TOPIC_PACKAGE.title} (${topic.trim()})` };
			}

			const characters = (draft.characters ?? []) as Array<{
				characterId: string;
				values?: Array<{ valueId: string; label: string; description: string }>;
			}>;

			const candidate = {
				...draft,
				topicPackageId,
				creatorId: uid,
				topic: topic.trim(),
				language: lang,
				status: AgoraTopicStatus.draft,
				// The answer key mirrors each character's values
				valueAnswerKey: characters.map((character) => ({
					characterId: character.characterId,
					expectedValues: character.values ?? [],
				})),
				scenes: ((draft.scenes ?? []) as Array<Record<string, unknown>>).map((scene) => ({
					imageUrls: [],
					dialogue: [],
					...scene,
				})),
				createdAt: now,
				lastUpdate: now,
			};

			// Validate against the shared schema so a malformed AI response
			// fails loudly here instead of breaking clients later.
			const validated: AgoraTopicPackage = parse(AgoraTopicPackageSchema, candidate);

			await db
				.collection(Collections.agoraTopicPackages)
				.doc(topicPackageId)
				.set(validated);

			return { topicPackageId };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.generateTopicPackage',
				userId: uid,
				metadata: { topic, language: lang },
			});
			throw new HttpsError('internal', 'Failed to generate topic package');
		}
	}
);

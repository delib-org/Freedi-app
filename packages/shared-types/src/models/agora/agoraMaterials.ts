import { array, boolean, number, object, optional, picklist, string, InferOutput } from 'valibot';

/**
 * Background materials a teacher attaches to a library scene, and the private
 * "ask the materials" conversation each student holds about them.
 *
 * Materials live apart from the topic package: the package is the scene's
 * story (small, rendered everywhere), the materials are reading matter with
 * extracted text that can run to tens of thousands of characters. Doc id:
 * `${topicPackageId}--${sceneId}` in `agoraSceneMaterials`. Written by the
 * `agoraSceneMaterials` callable only; any signed-in user may read (students
 * read them in the library).
 *
 * The chat doc is one per student per session — `${sessionId}--${uid}` in
 * `agoraMaterialChats`. Written by `agoraAskMaterials` only, readable by its
 * owner only: classmates and the teacher console never see it.
 */
export const AGORA_MATERIALS = {
	/** Items on one scene */
	MAX_ITEMS: 8,
	/** One item's stored text */
	MAX_ITEM_CHARS: 30000,
	/** All of a scene's stored text together — what one question sends the model */
	MAX_TOTAL_CHARS: 60000,
	MAX_TITLE_CHARS: 80,
	/** An uploaded PDF */
	MAX_PDF_BYTES: 8 * 1024 * 1024,
	/** A fetched page (bytes read before extraction) */
	MAX_LINK_BYTES: 2 * 1024 * 1024,
	LINK_TIMEOUT_MS: 10000,
	/** Questions one student may ask in one lesson (session), across all scenes */
	QUESTIONS_PER_SESSION: 15,
	MAX_QUESTION_CHARS: 500,
	/** Earlier turns of the same scene the model sees, student+AI pairs */
	HISTORY_PAIRS: 4,
	MAX_ANSWER_TOKENS: 600,
} as const;

export const AGORA_MATERIAL_KINDS = ['text', 'pdf', 'link'] as const;
export type AgoraMaterialKind = (typeof AGORA_MATERIAL_KINDS)[number];

export const AgoraMaterialItemSchema = object({
	materialId: string(),
	kind: picklist(AGORA_MATERIAL_KINDS),
	title: string(),
	/** The extracted plain text the AI answers from */
	text: string(),
	/** Characters of `text` (after truncation) */
	charCount: number(),
	/** The source was longer than the cap and `text` is its beginning */
	truncated: optional(boolean()),
	/** link: the page the text came from */
	sourceUrl: optional(string()),
	/** pdf: where students open the original */
	fileUrl: optional(string()),
	storagePath: optional(string()),
	pageCount: optional(number()),
	addedAt: number(),
});

export type AgoraMaterialItem = InferOutput<typeof AgoraMaterialItemSchema>;

export const AgoraSceneMaterialsSchema = object({
	topicPackageId: string(),
	sceneId: string(),
	teacherId: string(),
	items: array(AgoraMaterialItemSchema),
	lastUpdate: number(),
});

export type AgoraSceneMaterials = InferOutput<typeof AgoraSceneMaterialsSchema>;

export function createAgoraSceneMaterialsId(topicPackageId: string, sceneId: string): string {
	return `${topicPackageId}--${sceneId}`;
}

export function createAgoraMaterialChatId(sessionId: string, uid: string): string {
	return `${sessionId}--${uid}`;
}

export const AgoraMaterialMessageSchema = object({
	id: string(),
	sceneId: string(),
	role: picklist(['student', 'ai']),
	text: string(),
	at: number(),
	/** AI turn only: the materials did not contain the answer */
	notInMaterials: optional(boolean()),
});

export type AgoraMaterialMessage = InferOutput<typeof AgoraMaterialMessageSchema>;

export const AgoraMaterialChatSchema = object({
	sessionId: string(),
	userId: string(),
	/** Questions asked so far in this session — the quota counter */
	used: number(),
	messages: array(AgoraMaterialMessageSchema),
	lastUpdate: number(),
});

export type AgoraMaterialChat = InferOutput<typeof AgoraMaterialChatSchema>;

/** `agoraSceneMaterials` — teacher only (the package's creator) */
export type SceneMaterialsRequest =
	| { action: 'addText'; topicPackageId: string; sceneId: string; title: string; text: string }
	| {
			action: 'addPdf';
			topicPackageId: string;
			sceneId: string;
			title?: string;
			storagePath: string;
			fileUrl: string;
	  }
	| { action: 'addLink'; topicPackageId: string; sceneId: string; title?: string; url: string }
	| { action: 'remove'; topicPackageId: string; sceneId: string; materialId: string };

/** Why adding failed — the teacher sees a message per reason */
export type SceneMaterialsFailure =
	| 'empty'
	| 'too_many'
	| 'too_big'
	| 'pdf_unreadable'
	| 'pdf_no_text'
	| 'link_invalid'
	| 'link_unreachable'
	| 'link_not_text'
	| 'link_no_text';

export type SceneMaterialsResponse =
	| { ok: true; items: AgoraMaterialItem[] }
	| { ok: false; reason: SceneMaterialsFailure };

/** `agoraAskMaterials` — a student asks about one scene's materials */
export interface AskMaterialsRequest {
	sessionId: string;
	sceneId: string;
	question: string;
	/** The student's UI language (he, en, ar, es, de, nl) — the answer's language */
	language: string;
}

export type AskMaterialsResponse =
	| { ok: true; answer: string; notInMaterials: boolean; used: number; limit: number }
	| {
			ok: false;
			reason: 'limit' | 'no_materials' | 'empty' | 'unavailable';
			used: number;
			limit: number;
	  }
	| {
			ok: false;
			reason: 'language';
			used: number;
			limit: number;
			strikes: number;
			deducted: number;
			pointsTotal: number;
	  }
	| {
			/** The question held a word on the teacher's own list — nothing was charged */
			ok: false;
			reason: 'banned_word';
			used: number;
			limit: number;
			word: string;
	  };

import { ThreadChat, type ThreadChatServices } from '../src/views/ThreadChat';
import { initInbox, addInboxItem } from '../src/lib/inbox';
import m from 'mithril';
import {
	AgoraStage,
	AgoraMessageKind,
	AgoraSuggestionStatus,
	AGORA_POINTS,
	StatementType,
	type AgoraSession,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';
import type { AgoraProposal } from '../src/lib/proposals';
import type { VillageCommunitySource } from '../src/components/VillageCommunity';
import { VillageShell } from '../src/components/VillageShell';
import { villagePlace } from '../src/lib/flows/villageRoute';
import { initI18n, setLang } from '../src/lib/i18n';
import '@fontsource/assistant/400.css';
import '@fontsource/assistant/700.css';
import '../src/styles/global.scss';
import '../src/styles/components.scss';
import '../src/styles/theme-civic.scss';
initI18n();
setLang('he');
const uid = new URLSearchParams(location.search).get('student') === 'noam' ? 'noam' : 'maya';
const names: Record<string, string> = { maya: 'מאיה', noam: 'נועם' };
const key = 'agora-village-community-demo-v1';
initInbox('local-community-demo-' + uid);
const plan: AgoraStagePlanItem[] = [
	{
		itemId: 'story',
		stage: AgoraStage.question,
		kind: 'story',
		statementId: 'story-q',
		title: 'הסיפור האישי',
	},
	{
		itemId: 'needs',
		stage: AgoraStage.question,
		kind: 'needs',
		statementId: 'needs-q',
		title: 'מה חשוב לנו',
	},
	{ itemId: 'solution', stage: AgoraStage.deliberation, title: 'סדנת הפתרונות' },
];
interface DemoState {
	notes: AgoraProposal[];
	messages: AgoraProposal[];
	points: Record<string, number>;
	seen: Record<string, number>;
}
function note(id: string, creatorId: string, text: string, parentId = 'solution'): AgoraProposal {
	return {
		statementId: id,
		creatorId,
		statement: text,
		parentId,
		anonName: names[creatorId],
		statementType: StatementType.option,
		createdAt: Date.now(),
		lastUpdate: Date.now(),
	};
}
function read(): DemoState {
	const raw = localStorage.getItem(key);
	return raw
		? JSON.parse(raw)
		: {
				notes: [
					note('maya-solution', 'maya', 'נקים מועצה שבה לכל קבוצה יהיה קול שווה.'),
					note('noam-solution', 'noam', 'נחלק את נטל המס לפי היכולת של כל משפחה.'),
					note('noam-story', 'noam', 'חשוב לי שגם אנשים שלא רגילים לדבר יישמעו.', 'story-q'),
					note('maya-needs', 'maya', 'אני צריכה להרגיש שההחלטה הוגנת לכולם.', 'needs-q'),
				],
				messages: [],
				points: { maya: 0, noam: 0 },
				seen: {},
			};
}
function write(change: (state: DemoState) => void) {
	const state = read();
	change(state);
	localStorage.setItem(key, JSON.stringify(state));
	syncNews();
	m.redraw();
}
if (!localStorage.getItem(key)) write(() => {});
window.addEventListener('storage', () => {
	syncNews();
	m.redraw();
});
let viewingIndex = 2,
	draft = '';
const session = { sessionId: 'local-community-demo' } as AgoraSession;
const source: VillageCommunitySource = {
	notes: (item) => read().notes.filter((n) => n.parentId === (item.statementId ?? 'solution')),
	threads: (id) => {
		const result = new Map<string, AgoraProposal[]>();
		for (const msg of read().messages.filter((n) => n.parentId === id)) {
			const helper = msg.agoraThreadUserId!;
			result.set(helper, [...(result.get(helper) ?? []), msg]);
		}
		return result;
	},
	messages: (id, helper) =>
		read().messages.filter((n) => n.parentId === id && n.agoraThreadUserId === helper),
	unread: (id, messages, user) =>
		messages.filter((n) => n.creatorId !== user && n.createdAt > (read().seen[user + id] ?? 0))
			.length,
	renderThread: (a) => m(ThreadChat, { ...a, canEditProposal: false, services: demoServices }),
};
function syncNews() {
	const state = read();
	for (const msg of state.messages) {
		const parent = state.notes.find((n) => n.statementId === msg.parentId);
		if (!parent) continue;
		const helper = msg.agoraThreadUserId ?? msg.creatorId;
		const recipient = msg.creatorId === parent.creatorId ? helper : parent.creatorId;
		const target = { kind: 'thread' as const, proposalId: parent.statementId, helperUid: helper };
		if (
			recipient === uid &&
			msg.creatorId !== uid &&
			msg.agoraMessageKind !== AgoraMessageKind.award
		)
			addInboxItem({
				id: 'message-' + msg.statementId,
				trigger:
					msg.agoraMessageKind === AgoraMessageKind.suggestion
						? 'agora_suggestion_received'
						: 'agora_thread_message',
				detail: msg.statement,
				at: msg.createdAt,
				target,
			});
		if (msg.creatorId === uid && msg.suggestionStatus === AgoraSuggestionStatus.thanked)
			addInboxItem({
				id: 'thanks-' + msg.statementId,
				trigger: 'agora_suggestion_thanked',
				detail: 'תודה על השיפור · קיבלת מטבע',
				at: msg.lastUpdate,
				target,
			});
	}
}
const demoServices: ThreadChatServices = {
	getThreadMessages: (id, helper) => source.messages(id, helper),
	openSuggestionsBy: (id, user) =>
		read().messages.filter(
			(n) =>
				n.parentId === id &&
				n.creatorId === user &&
				n.agoraMessageKind === AgoraMessageKind.suggestion &&
				(!n.suggestionStatus || n.suggestionStatus === AgoraSuggestionStatus.open),
		).length,
	markThreadSeen: (id, at) => {
		const state = read();
		if ((state.seen[uid + id] ?? 0) >= at) return;
		state.seen[uid + id] = at;
		localStorage.setItem(key, JSON.stringify(state));
	},
	submitThreadMessage: async (_session, proposal, _name, text, kind, helper) => {
		write((state) =>
			state.messages.push({
				...note(crypto.randomUUID(), uid, text, proposal.statementId),
				statementType: StatementType.suggestion,
				agoraThreadUserId: helper ?? uid,
				agoraMessageKind: kind,
			}),
		);
	},
	resolveSuggestion: async (_session, id, resolution) => {
		write((state) => {
			const msg = state.messages.find((n) => n.statementId === id);
			const parent = state.notes.find((n) => n.statementId === msg?.parentId);
			if (
				!msg ||
				parent?.creatorId !== uid ||
				msg.creatorId === uid ||
				msg.agoraMessageKind !== AgoraMessageKind.suggestion ||
				(msg.suggestionStatus && msg.suggestionStatus !== AgoraSuggestionStatus.open)
			)
				return;
			msg.suggestionStatus = resolution;
			msg.lastUpdate = Date.now();
			if (resolution === AgoraSuggestionStatus.thanked) {
				state.points[msg.creatorId] =
					(state.points[msg.creatorId] ?? 0) + AGORA_POINTS.SUGGESTION_THANKED;
				state.messages.push({
					...note('award-' + id, uid, '', parent.statementId),
					statementType: StatementType.suggestion,
					agoraThreadUserId: msg.agoraThreadUserId,
					agoraMessageKind: AgoraMessageKind.award,
					agoraPointsAwarded: AGORA_POINTS.SUGGESTION_THANKED,
				});
			}
		});
	},
};
syncNews();

m.mount(document.getElementById('demo')!, {
	view: () =>
		m('main', { dir: 'rtl' }, [
			m(
				'header',
				{
					style: {
						padding: '12px',
						background: '#233f35',
						color: 'white',
						display: 'flex',
						gap: '16px',
						alignItems: 'center',
						flexWrap: 'wrap',
					},
				},
				[
					m('strong', `הדגמה מקומית · ${names[uid]} · המטבעות כאן הם להדגמה`),
					m(
						'a',
						{
							href: `?student=${uid === 'maya' ? 'noam' : 'maya'}`,
							target: '_blank',
							style: { color: '#ffe694' },
						},
						`פתיחת ${uid === 'maya' ? 'נועם' : 'מאיה'} בחלון נוסף`,
					),
				],
			),
			m(
				VillageShell,
				{
					plan,
					currentIndex: 2,
					viewingIndex,
					onWrite: () => {
						draft =
							source.notes(plan[viewingIndex]).find((n) => n.creatorId === uid)?.statement ?? '';
					},
					onSelectBook: (id: string) => {
						viewingIndex = plan.findIndex((p) => p.itemId === id);
					},
					papers: source
						.notes(plan[viewingIndex])
						.map((n) => ({ text: n.statement, own: n.creatorId === uid })),
					stationPapers: plan.map((p) => ({
						itemId: p.itemId,
						place: villagePlace(p),
						papers: source.notes(p).map((n) => ({ text: n.statement, own: n.creatorId === uid })),
					})),
					community: {
						session,
						userId: uid,
						anonName: names[uid],
						points: read().points[uid],
						source,
					},
				},
				[
					m('h2', plan[viewingIndex].title),
					m('textarea.text-input', {
						placeholder: 'כתבו את הפתק שלכם',
						value: draft,
						oninput: (e: InputEvent) => {
							draft = (e.target as HTMLTextAreaElement).value;
						},
					}),
					m(
						'button.btn.btn--primary',
						{
							disabled:
								!draft.trim() ||
								draft.trim() ===
									source.notes(plan[viewingIndex]).find((n) => n.creatorId === uid)?.statement,
							onclick: () => {
								write((state) => {
									const parent = plan[viewingIndex].statementId ?? 'solution';
									const existing = state.notes.find(
										(n) => n.creatorId === uid && n.parentId === parent,
									);
									if (existing) existing.statement = draft.trim();
									else state.notes.push(note(crypto.randomUUID(), uid, draft.trim(), parent));
								});
								draft = '';
							},
						},
						'פרסום הפתק',
					),
				],
			),
		]),
});

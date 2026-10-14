import m from 'mithril';
import {
	AGORA_LIBRARY_COMMUNITY,
	AgoraScenarioPost,
	AgoraTopicPackage,
	PostThreadEntry,
	buildPostThread,
	canUnhidePost,
} from '@freedi/shared-types';
import { getLang, t } from '../../../lib/i18n';
import { fetchPosts, hidePost, postToThread } from '../../../lib/scenarioLibrary/api';
import { getLibraryStore } from '../../../lib/scenarioLibrary/state';
import { getUserState } from '../../../lib/user';
import { ReportButton } from './ReportButton';

export interface ScenarioDiscussionAttrs {
	scenario: AgoraTopicPackage;
	/** The signed-in teacher wrote the scenario */
	mine: boolean;
	/** The post count changed: the page reads the scenario again */
	onChanged: () => void;
}

type Sending = 'idle' | 'sending' | 'failed' | 'blocked' | 'limit';

const COUNT_FROM = 800;

function errorKind(error: unknown): Sending {
	const code = (error as { code?: string }).code;
	if (code === 'functions/invalid-argument') return 'blocked';
	if (code === 'functions/resource-exhausted') return 'limit';

	return 'failed';
}

/**
 * The conversation under a scenario: one level of replies, a composer at the
 * top, and — for the scenario's author and a system admin — the hide controls.
 * A hide by an admin is lifted by an admin only; the author lifts their own.
 */
export function ScenarioDiscussion(): m.Component<ScenarioDiscussionAttrs> {
	let posts: AgoraScenarioPost[] = [];
	let loaded = false;
	let loadedFor = '';
	let draft = '';
	let sending: Sending = 'idle';
	let replyTo: string | null = null;
	let replyDraft = '';
	let replySending: Sending = 'idle';
	let hideFailed = false;

	async function load(attrs: ScenarioDiscussionAttrs): Promise<void> {
		loadedFor = attrs.scenario.topicPackageId;
		try {
			posts = await fetchPosts(attrs.scenario.topicPackageId, {
				uid: getUserState().user?.uid ?? null,
				isOwner: attrs.mine,
				isAdmin: getLibraryStore().isAdmin,
			});
		} catch (error) {
			console.error('[Library] Loading the discussion failed:', error);
		}
		loaded = true;
		m.redraw();
	}

	async function send(attrs: ScenarioDiscussionAttrs, parentId?: string): Promise<void> {
		const text = (parentId ? replyDraft : draft).trim();
		const busy = parentId ? replySending : sending;
		if (!text || busy === 'sending') return;
		if (parentId) replySending = 'sending';
		else sending = 'sending';
		m.redraw();
		try {
			await postToThread({
				scenarioId: attrs.scenario.topicPackageId,
				text,
				...(parentId ? { parentId } : {}),
			});
			if (parentId) {
				replyDraft = '';
				replyTo = null;
				replySending = 'idle';
			} else {
				draft = '';
				sending = 'idle';
			}
			await load(attrs);
			attrs.onChanged();
		} catch (error) {
			console.error('[Library] Posting failed:', error);
			if (parentId) replySending = errorKind(error);
			else sending = errorKind(error);
		}
		m.redraw();
	}

	async function toggleHidden(
		attrs: ScenarioDiscussionAttrs,
		post: AgoraScenarioPost,
	): Promise<void> {
		hideFailed = false;
		try {
			await hidePost({ postId: post.postId, action: post.hidden ? 'unhide' : 'hide' });
			await load(attrs);
			attrs.onChanged();
		} catch (error) {
			console.error('[Library] Hiding a post failed:', error);
			hideFailed = true;
		}
		m.redraw();
	}

	function problem(state: Sending): m.Children {
		const key =
			state === 'blocked'
				? 'scenlib.disc_blocked'
				: state === 'limit'
					? 'scenlib.disc_limit'
					: state === 'failed'
						? 'scenlib.disc_failed'
						: null;

		return key ? m('p.scn-field__error', { role: 'alert' }, t(key)) : null;
	}

	function composer(
		id: string,
		label: string,
		value: string,
		state: Sending,
		onInput: (text: string) => void,
		onSend: () => void,
		sendLabel: string,
		onCancel?: () => void,
	): m.Children {
		const max = AGORA_LIBRARY_COMMUNITY.POST_MAX;

		return m('.scn-compose', [
			m('label.scn-field__label', { for: id }, label),
			m('textarea.text-input', {
				id,
				rows: 3,
				value,
				maxlength: max,
				placeholder: t('scenlib.disc_ph'),
				oninput: (event: InputEvent) => onInput((event.target as HTMLTextAreaElement).value),
			}),
			m(
				'p.scn-field__hint.scn-field__hint--end',
				value.length >= COUNT_FROM ? t('scenlib.disc_count', { n: value.length, max }) : '',
			),
			m('.scn-compose__actions', [
				m(
					'button.btn.btn--primary.btn--sm',
					{
						type: 'button',
						'aria-disabled': !value.trim() || state === 'sending' ? 'true' : undefined,
						onclick: onSend,
					},
					state === 'sending' ? t('scenlib.disc_sending') : sendLabel,
				),
				onCancel
					? m(
							'button.btn.btn--ghost.btn--sm',
							{ type: 'button', onclick: onCancel },
							t('scenlib.disc_cancel'),
						)
					: null,
			]),
			problem(state),
		]);
	}

	function postView(
		attrs: ScenarioDiscussionAttrs,
		post: AgoraScenarioPost,
		canReply: boolean,
	): m.Children {
		const store = getLibraryStore();
		const isOwner = attrs.mine;
		const uid = getUserState().user?.uid;
		const moderates = isOwner || store.isAdmin;
		const canLift = canUnhidePost(post, { isAdmin: store.isAdmin, isOwner });
		const own = post.authorId === uid;
		const byAuthor = post.authorId === attrs.scenario.creatorId;

		return m(
			'article.scn-post',
			{
				class: [own ? 'scn-post--mine' : '', post.hidden ? 'scn-post--hidden' : '']
					.filter(Boolean)
					.join(' '),
			},
			[
				m('.scn-post__head', [
					m(
						'span.scn-post__who',
						own ? t('scenlib.disc_you') : post.authorName || t('scenlib.author_anon'),
					),
					byAuthor ? m('span.scn-pill', t('scenlib.disc_author_badge')) : null,
					m('span.scn-post__date', new Date(post.createdAt).toLocaleDateString(getLang())),
					post.hidden ? m('span.scn-pill.scn-pill--draft', t('scenlib.disc_hidden')) : null,
				]),
				m('p.scn-post__text', post.text),
				post.hidden
					? m(
							'p.scn-note',
							t(
								post.hiddenBy === 'owner'
									? 'scenlib.disc_hidden_owner'
									: 'scenlib.disc_hidden_admin',
							),
						)
					: null,
				m('.scn-post__actions', [
					canReply && !post.hidden
						? m(
								'button.btn.btn--ghost.btn--sm',
								{
									type: 'button',
									'aria-expanded': replyTo === post.postId ? 'true' : 'false',
									onclick: () => {
										replyTo = replyTo === post.postId ? null : post.postId;
										replyDraft = '';
										replySending = 'idle';
									},
								},
								t('scenlib.disc_reply'),
							)
						: null,
					!own && !post.hidden ? m(ReportButton, { kind: 'post', targetId: post.postId }) : null,
					moderates && (!post.hidden || canLift)
						? m(
								'button.btn.btn--ghost.btn--sm',
								{ type: 'button', onclick: () => void toggleHidden(attrs, post) },
								t(post.hidden ? 'scenlib.disc_unhide' : 'scenlib.disc_hide'),
							)
						: null,
				]),
			],
		);
	}

	function entryView(attrs: ScenarioDiscussionAttrs, entry: PostThreadEntry): m.Children {
		const { post, replies } = entry;

		return m('li.scn-thread__item', { key: post.postId }, [
			postView(attrs, post, true),
			replies.length > 0
				? m(
						'ul.scn-thread__replies',
						{ role: 'list' },
						replies.map((reply) => m('li', { key: reply.postId }, postView(attrs, reply, false))),
					)
				: null,
			replyTo === post.postId
				? m(
						'.scn-thread__reply-box',
						composer(
							`scn-reply-${post.postId}`,
							t('scenlib.disc_reply_label', { name: post.authorName || t('scenlib.author_anon') }),
							replyDraft,
							replySending,
							(text) => {
								replyDraft = text;
								replySending = 'idle';
							},
							() => void send(attrs, post.postId),
							t('scenlib.disc_reply_send'),
							() => {
								replyTo = null;
							},
						),
					)
				: null,
		]);
	}

	return {
		view({ attrs }) {
			if (loadedFor !== attrs.scenario.topicPackageId) void load(attrs);
			const store = getLibraryStore();
			const thread = buildPostThread(posts, attrs.mine || store.isAdmin);

			return m('section.scn-discussion', { 'aria-label': t('scenlib.disc_title') }, [
				m('h2.scn-section-title', t('scenlib.disc_title')),
				m('p.scn-note', t('scenlib.disc_hint')),
				composer(
					'scn-post-new',
					t('scenlib.disc_label'),
					draft,
					sending,
					(text) => {
						draft = text;
						sending = 'idle';
					},
					() => void send(attrs),
					t('scenlib.disc_send'),
				),
				hideFailed
					? m('p.scn-field__error', { role: 'alert' }, t('scenlib.disc_hide_failed'))
					: null,
				loaded && thread.length === 0
					? m('p.scn-note', t('scenlib.disc_empty'))
					: m(
							'ul.scn-thread',
							{ role: 'list' },
							thread.map((entry) => entryView(attrs, entry)),
						),
			]);
		},
	};
}

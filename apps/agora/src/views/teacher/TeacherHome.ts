import m from 'mithril';
import { t } from '../../lib/i18n';
import { getUserState, signInWithGoogle, ensureUser } from '../../lib/user';
import { createSession } from '../../lib/callables';
import { db, collection, query, where, getDocs } from '../../lib/firebase';
import {
	Collections,
	AgoraDeviceMode,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	AgoraTopicStatus,
} from '@freedi/shared-types';
import { parse } from 'valibot';
import { LanguagePicker } from '../../components/LanguagePicker';

export function TeacherHome(): m.Component {
	let topics: AgoraTopicPackage[] = [];
	let topicsLoaded = false;
	let selectedTopicId: string | null = null;
	let deviceMode: AgoraDeviceMode = AgoraDeviceMode.individual;
	let creating = false;

	async function loadTopics(): Promise<void> {
		try {
			await ensureUser();
			const snapshot = await getDocs(query(collection(db, Collections.agoraTopicPackages)));
			const loaded: AgoraTopicPackage[] = [];
			snapshot.forEach((docSnap) => {
				try {
					loaded.push(parse(AgoraTopicPackageSchema, docSnap.data()));
				} catch (error) {
					console.error('[Teacher] Invalid topic package:', error);
				}
			});
			topics = loaded;
			topicsLoaded = true;
			m.redraw();
		} catch (error) {
			console.error('[Teacher] Loading topics failed:', error);
			topicsLoaded = true;
			m.redraw();
		}
	}

	async function handleCreate(): Promise<void> {
		if (!selectedTopicId || creating) return;
		creating = true;
		m.redraw();
		try {
			const result = await createSession({
				topicPackageId: selectedTopicId,
				deviceMode,
			});
			m.route.set(`/teach/session/${result.sessionId}`);
		} catch (error) {
			console.error('[Teacher] Create session failed:', error);
			creating = false;
			m.redraw();
		}
	}

	void loadTopics();

	return {
		view() {
			const { tier, loading } = getUserState();

			if (loading) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			if (tier !== 2) {
				return m('.shell', [
					m(
						'.shell__content.text-center',
						{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
						[
							m('h2', t('teacher.title')),
							m('p.home-explanation', t('teacher.sign_in_required')),
							m(
								'button.btn.btn--primary',
								{
									onclick: () => {
										signInWithGoogle().catch((error: unknown) => {
											console.error('[Teacher] Sign-in failed:', error);
										});
									},
								},
								t('home.sign_in'),
							),
							m('button.btn.btn--ghost', { onclick: () => m.route.set('/') }, t('common.back')),
						],
					),
				]);
			}

			return m('.shell', [
				m('.home-header', [
					m(LanguagePicker),
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/') }, t('common.back')),
				]),

				m('.shell__content', { style: { gap: 'var(--space-xl)' } }, [
					m('h2', t('teacher.new_session')),

					m('.stack', [
						m('p.teacher__section-title', t('teacher.choose_topic')),
						!topicsLoaded
							? m('.spinner')
							: topics.length === 0
								? m('p.home-explanation', t('teacher.no_topics'))
								: m(
										'.stack',
										topics.map((topic) =>
											m(
												'.teacher__topic-option',
												{
													key: topic.topicPackageId,
													class:
														selectedTopicId === topic.topicPackageId
															? 'teacher__topic-option--selected'
															: undefined,
													onclick: () => {
														selectedTopicId = topic.topicPackageId;
													},
													role: 'button',
													tabindex: 0,
												},
												[
													m('strong', topic.title),
													m('.editor__row', [
														m(
															'span.values__score',
															topic.status === AgoraTopicStatus.ready
																? t('editor.ready')
																: t('editor.draft'),
														),
														m(
															'button.btn.btn--ghost',
															{
																onclick: (event: Event) => {
																	event.stopPropagation();
																	m.route.set(`/teach/topic/${topic.topicPackageId}`);
																},
															},
															'✎',
														),
													]),
												],
											),
										),
									),
					]),

					m('.stack', [
						m('p.teacher__section-title', t('teacher.device_mode')),
						m('.teacher__mode-row', [
							m(
								'button.btn',
								{
									class:
										deviceMode === AgoraDeviceMode.individual ? 'btn--primary' : 'btn--secondary',
									onclick: () => {
										deviceMode = AgoraDeviceMode.individual;
									},
								},
								t('teacher.individual'),
							),
							m(
								'button.btn',
								{
									class: deviceMode === AgoraDeviceMode.team ? 'btn--primary' : 'btn--secondary',
									onclick: () => {
										deviceMode = AgoraDeviceMode.team;
									},
								},
								t('teacher.team'),
							),
						]),
					]),

					m(
						'button.btn.btn--primary.btn--full.btn--lg',
						{ disabled: !selectedTopicId || creating, onclick: () => void handleCreate() },
						creating ? t('teacher.creating') : t('teacher.create'),
					),
				]),
			]);
		},
	};
}

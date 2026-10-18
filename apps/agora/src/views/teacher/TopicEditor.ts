import { backTarget } from '../../lib/routeTrail';
import m from 'mithril';
import { t } from '../../lib/i18n';
import { stalledBanner } from '../../components/StalledBanner';
import { TeacherNav } from '../../components/TeacherNav';
import { YoutubeListEditor } from '../../components/YoutubeListEditor';
import { LineTextArea } from '../../components/LineTextArea';
import { SceneMediaEditor } from '../../components/SceneMediaEditor';
import { MaterialsEditor } from '../../components/MaterialsEditor';
import {
	formatDialogue,
	formatLines,
	formatValues,
	megabytes,
	parseDialogue,
	parseLines,
	parseValues,
	saveErrorKey,
} from '../../lib/scenarioEditor';
import {
	fetchTopicPackage,
	saveTopicEditorFields,
	uploadTopicAsset,
	type TopicEditorFields,
} from '../../lib/teacher';
import {
	AgoraCharacter,
	AgoraScene,
	AgoraTopicPackage,
	AgoraTopicStatus,
} from '@freedi/shared-types';

const SAVED_FLASH_MS = 2000;

/**
 * Full review/edit surface for a generated topic package. Arrays edit as
 * line-based textareas (arguments: one per line; values: "label | desc";
 * dialogue: "speaker: line") to keep the form compact for teachers.
 */
export function TopicEditor(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const topicPackageId = initialVnode.attrs.id;
	let pkg: AgoraTopicPackage | null = null;
	let loadFailed = false;
	/** Which button is waiting on the server: both are dead until it answers */
	let saving: 'save' | 'ready' | null = null;
	let savedFlash = false;
	/** Edits made since the last confirmed save. What back has to ask about. */
	let dirty = false;
	/** Counts edits, so a save knows whether the teacher kept typing while it was in the air */
	let edits = 0;
	/** What the teacher must be told: a save or an upload that failed, a file that was refused */
	let problems: { key: string; params?: Record<string, string | number> }[] = [];
	const uploadProgress: Record<string, number> = {};
	const imageUploadProgress: Record<string, number> = {};

	function load(): void {
		fetchTopicPackage(topicPackageId)
			.then((loaded) => {
				if (loaded) {
					pkg = loaded;
				} else {
					loadFailed = true;
				}
				m.redraw();
			})
			.catch((error: unknown) => {
				console.error('[Editor] Load failed:', error);
				loadFailed = true;
				m.redraw();
			});
	}

	/** Every edit goes through here, onto the CURRENT package: never onto the copy a render captured */
	function patch(change: Partial<AgoraTopicPackage>): void {
		if (!pkg) return;
		pkg = { ...pkg, ...change };
		dirty = true;
		edits += 1;
	}

	/**
	 * Save ONLY the fields this editor owns — never the whole in-memory copy,
	 * which would overwrite fields the editor doesn't show with the values they
	 * had when it was opened. Runs under the confirmed-write clock, so an
	 * offline save surfaces as a stalled banner instead of a false "saved".
	 *
	 * The button waits ("Saving…") until the server answers, and a failure says
	 * why under it: a save that fails quietly is indistinguishable from a button
	 * that does nothing. Edits made while it was in the air stay unsaved.
	 */
	async function save(status?: AgoraTopicStatus): Promise<boolean> {
		if (!pkg || saving) return false;
		if (!pkg.title.trim()) {
			problems = [{ key: 'editor.title_required' }];

			return false;
		}
		saving = status ? 'ready' : 'save';
		problems = [];
		const revision = edits;
		const fields: TopicEditorFields = {
			title: pkg.title,
			framingText: pkg.framingText,
			challengeQuestion: pkg.challengeQuestion,
			characters: pkg.characters,
			scenes: pkg.scenes,
			...(status ? { status } : {}),
		};
		m.redraw();
		try {
			await saveTopicEditorFields(topicPackageId, fields);
			if (pkg) pkg = { ...pkg, ...(status ? { status } : {}), lastUpdate: Date.now() };
			if (edits === revision) dirty = false;
			savedFlash = true;
			setTimeout(() => {
				savedFlash = false;
				m.redraw();
			}, SAVED_FLASH_MS);

			return true;
		} catch (error) {
			console.error('[Editor] Save failed:', {
				operation: 'scenarioEditor.save',
				topicPackageId,
				code: (error as { code?: string }).code,
				error,
			});
			problems = [{ key: saveErrorKey(error) }];

			return false;
		} finally {
			saving = null;
			m.redraw();
		}
	}

	/** Back is where the teacher came from; a bookmark, or the form that just made this, lands on the list */
	function backFrom(): string {
		return backTarget('/teach/scenarios', ['/teach/scenarios/new']);
	}

	/**
	 * Leaving with unsaved edits. `confirm` offers two answers, so the safe one
	 * is the default: OK saves and goes, Cancel stays. A teacher who typed a
	 * paragraph into their own lesson has never meant to throw it away, so a
	 * save that fails keeps them here, with the edits, and says so.
	 */
	async function goBack(): Promise<void> {
		if (saving) return;
		if (!dirty) {
			m.route.set(backFrom());

			return;
		}
		if (!window.confirm(t('editor.leave_unsaved'))) return;
		if (await save()) {
			m.route.set(backFrom());
		} else {
			problems = [{ key: 'editor.leave_failed' }, ...problems];
			m.redraw();
		}
	}

	/** One scene's media change, onto the current package, then saved */
	function patchScene(sceneId: string, change: (scene: AgoraScene) => AgoraScene): void {
		if (!pkg) return;
		patch({
			scenes: pkg.scenes.map((candidate) =>
				candidate.sceneId === sceneId ? change(candidate) : candidate,
			),
		});
	}

	function uploadFailed(kind: 'video' | 'image', error: unknown): void {
		console.error('[Editor] Upload failed:', {
			operation: `scenarioEditor.upload.${kind}`,
			topicPackageId,
			error,
		});
		problems = [{ key: 'editor.upload_err' }];
	}

	function tooBig(limit: number): void {
		problems = [{ key: 'editor.file_too_big', params: { mb: megabytes(limit) } }];
	}

	function uploadVideo(scene: AgoraScene, file: File): void {
		uploadProgress[scene.sceneId] = 0;
		problems = [];
		uploadTopicAsset(topicPackageId, `${scene.sceneId}-${file.name}`, file, (percent) => {
			uploadProgress[scene.sceneId] = percent;
			m.redraw();
		})
			.then((url) => {
				patchScene(scene.sceneId, (candidate) => ({ ...candidate, videoUrl: url }));
				void save();
			})
			.catch((error: unknown) => {
				uploadFailed('video', error);
			})
			.finally(() => {
				delete uploadProgress[scene.sceneId];
				m.redraw();
			});
	}

	function uploadImage(scene: AgoraScene, file: File): void {
		imageUploadProgress[scene.sceneId] = 0;
		problems = [];
		uploadTopicAsset(topicPackageId, `${scene.sceneId}-img-${file.name}`, file, (percent) => {
			imageUploadProgress[scene.sceneId] = percent;
			m.redraw();
		})
			.then((url) => {
				patchScene(scene.sceneId, (candidate) => ({
					...candidate,
					imageUrls: [...candidate.imageUrls, url],
				}));
				void save();
			})
			.catch((error: unknown) => {
				uploadFailed('image', error);
			})
			.finally(() => {
				delete imageUploadProgress[scene.sceneId];
				m.redraw();
			});
	}

	function removeSceneImage(scene: AgoraScene, url: string): void {
		patchScene(scene.sceneId, (candidate) => ({
			...candidate,
			imageUrls: candidate.imageUrls.filter((current) => current !== url),
		}));
		void save();
	}

	function textArea(value: string, rows: number, onchange: (next: string) => void): m.Children {
		return m('textarea.text-input', {
			value,
			rows,
			oninput: (event: InputEvent) => {
				onchange((event.target as HTMLTextAreaElement).value);
			},
		});
	}

	function characterEditor(character: AgoraCharacter, index: number): m.Children {
		const update = (change: Partial<AgoraCharacter>): void => {
			if (!pkg) return;
			const characters = [...pkg.characters] as [AgoraCharacter, AgoraCharacter];
			characters[index] = { ...pkg.characters[index], ...change };
			patch({ characters });
		};

		return m('.card.stack', { key: character.characterId }, [
			m('.editor__row', [
				m('.editor__field', [
					m('label.teacher__section-title', t('editor.char_name')),
					m('input.text-input', {
						value: character.name,
						oninput: (event: InputEvent) => {
							update({ name: (event.target as HTMLInputElement).value });
						},
					}),
				]),
				m('.editor__field', [
					m('label.teacher__section-title', t('editor.char_role')),
					m('input.text-input', {
						value: character.role,
						oninput: (event: InputEvent) => {
							update({ role: (event.target as HTMLInputElement).value });
						},
					}),
				]),
			]),
			m('label.teacher__section-title', t('editor.char_args')),
			m(LineTextArea, {
				value: formatLines(character.arguments),
				rows: 4,
				onText: (text: string) => update({ arguments: parseLines(text) }),
			}),
			m('label.teacher__section-title', t('editor.char_needs')),
			m(LineTextArea, {
				value: formatLines(character.needs),
				rows: 4,
				onText: (text: string) => update({ needs: parseLines(text) }),
			}),
			m('label.teacher__section-title', t('editor.char_values')),
			m(LineTextArea, {
				value: formatValues(character.values),
				rows: 4,
				onText: (text: string) =>
					update({ values: parseValues(text, pkg?.characters[index].values ?? [], index) }),
			}),
		]);
	}

	function sceneEditor(scene: AgoraScene): m.Children {
		const update = (change: Partial<AgoraScene>): void => {
			patchScene(scene.sceneId, (candidate) => ({ ...candidate, ...change }));
		};
		const progress = uploadProgress[scene.sceneId];
		const imageProgress = imageUploadProgress[scene.sceneId];

		return m('.card.stack', { key: scene.sceneId }, [
			m('.editor__row', [
				m('span.values__score', t(`stage.${sceneStageLabel(scene.kind)}`) || scene.kind),
				m('input.text-input', {
					value: scene.title,
					oninput: (event: InputEvent) => {
						update({ title: (event.target as HTMLInputElement).value });
					},
				}),
			]),
			m('label.teacher__section-title', t('editor.scene_text')),
			textArea(scene.text, 3, (next) => update({ text: next })),
			scene.dialogue.length > 0 ||
			scene.kind.startsWith('perspective') ||
			scene.kind === 'needsA' ||
			scene.kind === 'needsB'
				? [
						m('label.teacher__section-title', t('editor.scene_dialogue')),
						m(LineTextArea, {
							value: formatDialogue(scene.dialogue),
							rows: 4,
							onText: (text: string) => update({ dialogue: parseDialogue(text) }),
						}),
					]
				: null,
			m(SceneMediaEditor, {
				scene,
				imageProgress,
				videoProgress: progress,
				onImage: (file: File) => uploadImage(scene, file),
				onVideo: (file: File) => uploadVideo(scene, file),
				onRemoveImage: (url: string) => removeSceneImage(scene, url),
				onTooBig: tooBig,
			}),
			m('label.teacher__section-title', t('video.editor_label')),
			m(YoutubeListEditor, {
				videos: scene.youtubeVideos ?? [],
				onChange: (youtubeVideos) => {
					update({ youtubeVideos });
				},
			}),
			m('label.teacher__section-title', t('mat.editor_label')),
			m(MaterialsEditor, { topicPackageId, sceneId: scene.sceneId }),
		]);
	}

	load();

	return {
		view() {
			if (loadFailed) {
				return m(
					'.shell',
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p.join__error', t('common.error')),
						m(
							'button.btn.btn--secondary',
							{ onclick: () => m.route.set(backFrom()) },
							t('common.back'),
						),
					]),
				);
			}
			if (!pkg) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			const current = pkg;

			return m('.shell', [
				m(TeacherNav, {
					title: current.title,
					onBack: () => void goBack(),
					trailing: [
						dirty ? m('span.teacher-nav__unsaved', t('editor.unsaved')) : null,
						m(
							'span.values__score',
							current.status === AgoraTopicStatus.ready ? t('editor.ready') : t('editor.draft'),
						),
					],
				}),
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					m('h2', t('editor.title')),
					m('input.text-input.code-input', {
						value: current.title,
						style: { letterSpacing: 'normal', textTransform: 'none' },
						oninput: (event: InputEvent) => {
							patch({ title: (event.target as HTMLInputElement).value });
						},
					}),

					current.authoringBrief
						? m('.card.stack', [
								m('p.teacher__section-title', t('wizard.description_label')),
								m(
									'p.home-card__text',
									{ style: { whiteSpace: 'pre-wrap' } },
									current.authoringBrief.description,
								),
								m('p.home-explanation', t('wizard.method_hint')),
							])
						: null,

					m('label.teacher__section-title', t('editor.framing')),
					textArea(current.framingText, 3, (next) => patch({ framingText: next })),

					m('label.teacher__section-title', t('editor.challenge')),
					textArea(current.challengeQuestion, 2, (next) => patch({ challengeQuestion: next })),

					m('h3', t('editor.characters')),
					m(
						'.stack',
						current.characters.map((character, index) => characterEditor(character, index)),
					),

					m('h3', t('editor.scenes')),
					m(
						'.stack',
						current.scenes.map((scene) => sceneEditor(scene)),
					),

					m('.editor__actions', [
						// A save wedged offline must not read as saved — this is the
						// confirmed-write clock's voice on a screen with no HUD
						stalledBanner(),
						// Inside the bar, not above it: the bar is what the teacher is
						// looking at when a press does not take
						...problems.map((problem) =>
							m('p.editor__error', { role: 'alert' }, t(problem.key, problem.params)),
						),
						m(
							'button.btn.btn--secondary',
							{
								type: 'button',
								disabled: saving !== null,
								'aria-busy': saving === 'save' ? 'true' : undefined,
								onclick: () => void save(),
							},
							saving === 'save'
								? t('editor.saving')
								: savedFlash
									? t('editor.saved')
									: t('editor.save'),
						),
						current.status !== AgoraTopicStatus.ready
							? m(
									'button.btn.btn--primary',
									{
										type: 'button',
										disabled: saving !== null,
										'aria-busy': saving === 'ready' ? 'true' : undefined,
										onclick: () => void save(AgoraTopicStatus.ready),
									},
									saving === 'ready' ? t('editor.saving') : t('editor.mark_ready'),
								)
							: null,
					]),
				]),
			]);
		},
	};
}

function sceneStageLabel(kind: string): string {
	switch (kind) {
		case 'intro':
		case 'timeTunnel':
		case 'periodExplainer':
			return 'framing';
		case 'perspectiveA':
		case 'perspectiveB':
			return 'perspectives';
		case 'needsQuestion':
		case 'needsA':
		case 'needsB':
			return 'needs';
		default:
			return 'results';
	}
}

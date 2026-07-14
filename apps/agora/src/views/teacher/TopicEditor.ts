import m from 'mithril';
import { t } from '../../lib/i18n';
import {
	db,
	doc,
	getDoc,
	updateDoc,
	storage,
	storageRef,
	uploadBytesResumable,
	getDownloadURL,
} from '../../lib/firebase';
import {
	Collections,
	AgoraCharacter,
	AgoraScene,
	AgoraTopicPackage,
	AgoraTopicPackageSchema,
	AgoraTopicStatus,
	AgoraValue,
	AGORA_LIMITS,
} from '@freedi/shared-types';
import { parse } from 'valibot';

/**
 * Full review/edit surface for a generated topic package. Arrays edit as
 * line-based textareas (arguments: one per line; values: "label | desc";
 * dialogue: "speaker: line") to keep the form compact for teachers.
 */
export function TopicEditor(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const topicPackageId = initialVnode.attrs.id;
	let pkg: AgoraTopicPackage | null = null;
	let loadFailed = false;
	let saving = false;
	let savedFlash = false;
	const uploadProgress: Record<string, number> = {};
	const imageUploadProgress: Record<string, number> = {};

	function load(): void {
		getDoc(doc(db, Collections.agoraTopicPackages, topicPackageId))
			.then((snapshot) => {
				if (snapshot.exists()) {
					pkg = parse(AgoraTopicPackageSchema, snapshot.data());
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

	function save(extra?: Partial<AgoraTopicPackage>): void {
		if (!pkg || saving) return;
		saving = true;
		const updated = { ...pkg, ...extra, lastUpdate: Date.now() };
		updateDoc(doc(db, Collections.agoraTopicPackages, topicPackageId), updated)
			.then(() => {
				pkg = updated;
				savedFlash = true;
				setTimeout(() => {
					savedFlash = false;
					m.redraw();
				}, 2000);
			})
			.catch((error: unknown) => {
				console.error('[Editor] Save failed:', error);
			})
			.finally(() => {
				saving = false;
				m.redraw();
			});
	}

	function uploadVideo(scene: AgoraScene, file: File): void {
		const path = `agora/${topicPackageId}/${scene.sceneId}-${file.name}`;
		const task = uploadBytesResumable(storageRef(storage, path), file);
		uploadProgress[scene.sceneId] = 0;
		task.on(
			'state_changed',
			(snapshot) => {
				uploadProgress[scene.sceneId] = Math.round(
					(snapshot.bytesTransferred / snapshot.totalBytes) * 100,
				);
				m.redraw();
			},
			(error) => {
				console.error('[Editor] Video upload failed:', error);
				delete uploadProgress[scene.sceneId];
				m.redraw();
			},
			() => {
				getDownloadURL(task.snapshot.ref)
					.then((url) => {
						if (!pkg) return;
						const scenes = pkg.scenes.map((candidate) =>
							candidate.sceneId === scene.sceneId ? { ...candidate, videoUrl: url } : candidate,
						);
						delete uploadProgress[scene.sceneId];
						save({ scenes });
					})
					.catch((error: unknown) => {
						console.error('[Editor] Getting video URL failed:', error);
					});
			},
		);
	}

	function uploadImage(scene: AgoraScene, file: File): void {
		const path = `agora/${topicPackageId}/${scene.sceneId}-img-${file.name}`;
		const task = uploadBytesResumable(storageRef(storage, path), file);
		imageUploadProgress[scene.sceneId] = 0;
		task.on(
			'state_changed',
			(snapshot) => {
				imageUploadProgress[scene.sceneId] = Math.round(
					(snapshot.bytesTransferred / snapshot.totalBytes) * 100,
				);
				m.redraw();
			},
			(error) => {
				console.error('[Editor] Image upload failed:', error);
				delete imageUploadProgress[scene.sceneId];
				m.redraw();
			},
			() => {
				getDownloadURL(task.snapshot.ref)
					.then((url) => {
						if (!pkg) return;
						const scenes = pkg.scenes.map((candidate) =>
							candidate.sceneId === scene.sceneId
								? { ...candidate, imageUrls: [...candidate.imageUrls, url] }
								: candidate,
						);
						delete imageUploadProgress[scene.sceneId];
						save({ scenes });
					})
					.catch((error: unknown) => {
						console.error('[Editor] Getting image URL failed:', error);
					});
			},
		);
	}

	function removeSceneImage(scene: AgoraScene, url: string): void {
		if (!pkg) return;
		const scenes = pkg.scenes.map((candidate) =>
			candidate.sceneId === scene.sceneId
				? { ...candidate, imageUrls: candidate.imageUrls.filter((current) => current !== url) }
				: candidate,
		);
		save({ scenes });
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
		const update = (patch: Partial<AgoraCharacter>): void => {
			if (!pkg) return;
			const characters = [...pkg.characters] as [AgoraCharacter, AgoraCharacter];
			characters[index] = { ...character, ...patch };
			pkg = { ...pkg, characters };
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
			textArea(character.arguments.join('\n'), 4, (next) => {
				update({ arguments: next.split('\n').filter((line) => line.trim()) });
			}),
			m('label.teacher__section-title', t('editor.char_needs')),
			textArea((character.needs ?? []).join('\n'), 4, (next) => {
				update({ needs: next.split('\n').filter((line) => line.trim()) });
			}),
			m('label.teacher__section-title', t('editor.char_values')),
			textArea(
				character.values.map((value) => `${value.label} | ${value.description}`).join('\n'),
				4,
				(next) => {
					const values: AgoraValue[] = next
						.split('\n')
						.filter((line) => line.trim())
						.map((line, valueIndex) => {
							const [label, ...rest] = line.split('|');

							return {
								valueId: character.values[valueIndex]?.valueId ?? `val-${index}-${valueIndex}`,
								label: label.trim(),
								description: rest.join('|').trim(),
							};
						});
					update({ values });
				},
			),
		]);
	}

	function sceneEditor(scene: AgoraScene): m.Children {
		const update = (patch: Partial<AgoraScene>): void => {
			if (!pkg) return;
			const scenes = pkg.scenes.map((candidate) =>
				candidate.sceneId === scene.sceneId ? { ...candidate, ...patch } : candidate,
			);
			pkg = { ...pkg, scenes };
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
						textArea(
							scene.dialogue.map((line) => `${line.speaker}: ${line.line}`).join('\n'),
							4,
							(next) => {
								update({
									dialogue: next
										.split('\n')
										.filter((line) => line.includes(':'))
										.map((line) => {
											const [speaker, ...rest] = line.split(':');

											return { speaker: speaker.trim(), line: rest.join(':').trim() };
										}),
								});
							},
						),
					]
				: null,
			m('label.teacher__section-title', t('editor.images')),
			scene.imageUrls.length > 0
				? m(
						'.editor__image-list',
						scene.imageUrls.map((url) =>
							m('.editor__image-item', { key: url }, [
								m('img.editor__image-thumb', { src: url, alt: '' }),
								m(
									'button.btn.btn--ghost.btn--sm',
									{ onclick: () => removeSceneImage(scene, url) },
									t('editor.remove_image'),
								),
							]),
						),
					)
				: null,
			imageProgress !== undefined
				? m('p.lobby__status', t('editor.image_uploading', { pct: imageProgress }))
				: m('input.editor__file', {
						type: 'file',
						accept: 'image/*',
						onchange: (event: Event) => {
							const file = (event.target as HTMLInputElement).files?.[0];
							if (file && file.size <= AGORA_LIMITS.MAX_IMAGE_BYTES) {
								uploadImage(scene, file);
							}
						},
					}),
			m('label.teacher__section-title', t('editor.video')),
			progress !== undefined
				? m('p.lobby__status', t('editor.video_uploading', { pct: progress }))
				: m('input.editor__file', {
						type: 'file',
						accept: 'video/*',
						onchange: (event: Event) => {
							const file = (event.target as HTMLInputElement).files?.[0];
							if (file && file.size <= AGORA_LIMITS.MAX_VIDEO_BYTES) {
								uploadVideo(scene, file);
							}
						},
					}),
			scene.videoUrl
				? m('video.scene__video', { src: scene.videoUrl, controls: true, preload: 'metadata' })
				: null,
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
							{ onclick: () => m.route.set('/teach') },
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
				m('.home-header', [
					m(
						'span.values__score',
						current.status === AgoraTopicStatus.ready ? t('editor.ready') : t('editor.draft'),
					),
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/teach') }, t('common.back')),
				]),
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					m('h2', t('editor.title')),
					m('input.text-input.code-input', {
						value: current.title,
						style: { letterSpacing: 'normal', textTransform: 'none' },
						oninput: (event: InputEvent) => {
							pkg = { ...current, title: (event.target as HTMLInputElement).value };
						},
					}),

					m('label.teacher__section-title', t('editor.framing')),
					textArea(current.framingText, 3, (next) => {
						pkg = { ...current, framingText: next };
					}),

					m('label.teacher__section-title', t('editor.challenge')),
					textArea(current.challengeQuestion, 2, (next) => {
						pkg = { ...current, challengeQuestion: next };
					}),

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

					m('.delib__actions', [
						m(
							'button.btn.btn--secondary',
							{ disabled: saving, onclick: () => save() },
							savedFlash ? t('editor.saved') : t('editor.save'),
						),
						current.status !== AgoraTopicStatus.ready
							? m(
									'button.btn.btn--primary',
									{
										disabled: saving,
										onclick: () => save({ status: AgoraTopicStatus.ready }),
									},
									t('editor.mark_ready'),
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

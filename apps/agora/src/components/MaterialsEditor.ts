import m from 'mithril';
import { t } from '../lib/i18n';
import { fetchSceneMaterials, manageSceneMaterials, uploadMaterialPdf } from '../lib/materials';
import { checkPdfFile, failureKey } from '../lib/flows/materialsFlow';
import { AGORA_MATERIALS } from '@freedi/shared-types';
import type { AgoraMaterialItem, SceneMaterialsResponse } from '@freedi/shared-types';

export interface MaterialsEditorAttrs {
	topicPackageId: string;
	sceneId: string;
}

const PREVIEW_CHARS = 320;

function previewText(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();

	return flat.length <= PREVIEW_CHARS ? flat : `${flat.slice(0, PREVIEW_CHARS).trim()}…`;
}

/**
 * The teacher's background materials for one scene: pasted text, a PDF
 * (drag & drop), or a web link. The server extracts the text and stores it;
 * each row says how many characters were read and can show the start of them,
 * so the teacher knows it worked before a student ever opens it.
 */
export function MaterialsEditor(): m.Component<MaterialsEditorAttrs> {
	let items: AgoraMaterialItem[] = [];
	let loaded = false;
	let loadFailed = false;
	let busy = '';
	let progress: number | undefined;
	let errorText = '';
	let dragging = false;
	let textTitle = '';
	let textBody = '';
	let linkUrl = '';
	const previewOpen = new Set<string>();

	async function load(attrs: MaterialsEditorAttrs): Promise<void> {
		try {
			const found = await fetchSceneMaterials(attrs.topicPackageId, attrs.sceneId);
			items = found?.items ?? [];
		} catch (error) {
			console.error('[Materials] Load failed:', error);
			loadFailed = true;
		}
		loaded = true;
		m.redraw();
	}

	/** Run one server call under a status line; a refusal becomes a message, not an exception */
	async function run(
		label: string,
		call: () => Promise<SceneMaterialsResponse>,
		onOk?: () => void,
	): Promise<void> {
		if (busy) return;
		busy = label;
		errorText = '';
		m.redraw();
		try {
			const response = await call();
			if (response.ok) {
				const before = new Set(items.map((item) => item.materialId));
				items = response.items;
				for (const item of items)
					if (!before.has(item.materialId)) previewOpen.add(item.materialId);
				onOk?.();
			} else {
				errorText = t(failureKey(response.reason), { max: AGORA_MATERIALS.MAX_ITEMS });
			}
		} catch (error) {
			console.error('[Materials] Update failed:', error);
			errorText = t('mat.err_generic');
		}
		busy = '';
		progress = undefined;
		m.redraw();
	}

	function addText(attrs: MaterialsEditorAttrs): void {
		if (!textBody.trim()) {
			errorText = t('mat.err_empty');

			return;
		}
		void run(
			t('mat.working'),
			() =>
				manageSceneMaterials({
					action: 'addText',
					topicPackageId: attrs.topicPackageId,
					sceneId: attrs.sceneId,
					title: textTitle,
					text: textBody,
				}),
			() => {
				textBody = '';
				textTitle = '';
			},
		);
	}

	function addLink(attrs: MaterialsEditorAttrs): void {
		if (!linkUrl.trim()) {
			errorText = t('mat.err_link_invalid');

			return;
		}
		void run(
			t('mat.working'),
			() =>
				manageSceneMaterials({
					action: 'addLink',
					topicPackageId: attrs.topicPackageId,
					sceneId: attrs.sceneId,
					url: linkUrl.trim(),
				}),
			() => {
				linkUrl = '';
			},
		);
	}

	function addPdf(attrs: MaterialsEditorAttrs, file: File | undefined): void {
		if (!file || busy) return;
		const check = checkPdfFile(file);
		if (!check.ok) {
			errorText = t(check.key, { mb: AGORA_MATERIALS.MAX_PDF_BYTES / (1024 * 1024) });
			m.redraw();

			return;
		}
		void run(t('mat.working'), async () => {
			const uploaded = await uploadMaterialPdf(attrs.topicPackageId, file, (percent) => {
				progress = percent;
				m.redraw();
			});

			return manageSceneMaterials({
				action: 'addPdf',
				topicPackageId: attrs.topicPackageId,
				sceneId: attrs.sceneId,
				title: file.name.replace(/\.pdf$/i, ''),
				storagePath: uploaded.storagePath,
				fileUrl: uploaded.fileUrl,
			});
		});
	}

	function remove(attrs: MaterialsEditorAttrs, item: AgoraMaterialItem): void {
		void run(t('mat.working'), () =>
			manageSceneMaterials({
				action: 'remove',
				topicPackageId: attrs.topicPackageId,
				sceneId: attrs.sceneId,
				materialId: item.materialId,
			}),
		);
	}

	function itemRow(attrs: MaterialsEditorAttrs, item: AgoraMaterialItem): m.Vnode {
		const open = previewOpen.has(item.materialId);
		const facts = [
			t('mat.chars', { n: item.charCount }),
			item.pageCount ? t('mat.pages', { n: item.pageCount }) : '',
			item.truncated ? t('mat.truncated') : '',
		].filter(Boolean);

		return m('li.materials-editor__item', { key: item.materialId }, [
			m('.materials-editor__row', [
				m(
					`span.materials-editor__kind.materials-editor__kind--${item.kind}`,
					t(`mat.kind_${item.kind}`),
				),
				m('span.materials-editor__name', { dir: 'auto' }, item.title),
				m(
					'button.btn.btn--ghost.btn--sm',
					{
						type: 'button',
						'aria-expanded': open ? 'true' : 'false',
						onclick: () => {
							if (open) previewOpen.delete(item.materialId);
							else previewOpen.add(item.materialId);
						},
					},
					open ? t('mat.preview_hide') : t('mat.preview_show'),
				),
				m(
					'button.btn.btn--ghost.btn--sm',
					{ type: 'button', disabled: !!busy, onclick: () => remove(attrs, item) },
					t('mat.remove'),
				),
			]),
			m('p.materials-editor__facts', { role: 'status' }, facts.join(' · ')),
			open ? m('p.materials-editor__preview', { dir: 'auto' }, previewText(item.text)) : null,
		]);
	}

	return {
		oninit(vnode) {
			void load(vnode.attrs);
		},
		view(vnode) {
			const attrs = vnode.attrs;
			const used = items.reduce((sum, item) => sum + item.charCount, 0);
			const full = items.length >= AGORA_MATERIALS.MAX_ITEMS;

			return m(
				'.materials-editor',
				{ 'data-scene': attrs.sceneId, 'aria-busy': busy ? 'true' : 'false' },
				[
					m('p.materials-editor__hint', t('mat.editor_hint')),

					loaded && loadFailed
						? m('p.materials-editor__error', { role: 'alert' }, t('mat.err_generic'))
						: null,

					items.length > 0
						? m(
								'ul.materials-editor__list',
								items.map((item) => itemRow(attrs, item)),
							)
						: null,
					items.length > 0
						? m(
								'p.materials-editor__total',
								t('mat.total', { n: used, max: AGORA_MATERIALS.MAX_TOTAL_CHARS }),
							)
						: null,

					// PDF: a drop zone that is also a button, so it works from the keyboard
					m(
						'button.materials-editor__drop',
						{
							type: 'button',
							class: dragging ? 'materials-editor__drop--over' : '',
							disabled: !!busy || full,
							onclick: (event: MouseEvent) => {
								const input = (
									event.currentTarget as HTMLElement
								).parentElement?.querySelector<HTMLInputElement>('.materials-editor__file');
								input?.click();
							},
							ondragover: (event: DragEvent) => {
								event.preventDefault();
								dragging = true;
							},
							ondragleave: () => {
								dragging = false;
							},
							ondrop: (event: DragEvent) => {
								event.preventDefault();
								dragging = false;
								addPdf(attrs, event.dataTransfer?.files?.[0]);
							},
						},
						dragging ? t('mat.drop_release') : t('mat.drop_pdf'),
					),
					m('input.materials-editor__file', {
						type: 'file',
						accept: 'application/pdf,.pdf',
						tabindex: -1,
						'aria-hidden': 'true',
						onchange: (event: Event) => {
							const input = event.target as HTMLInputElement;
							addPdf(attrs, input.files?.[0]);
							input.value = '';
						},
					}),

					// Text
					m('.materials-editor__box', [
						m('input.text-input', {
							type: 'text',
							maxlength: AGORA_MATERIALS.MAX_TITLE_CHARS,
							placeholder: t('mat.text_title_ph'),
							'aria-label': t('mat.text_title_ph'),
							value: textTitle,
							oninput: (event: InputEvent) => {
								textTitle = (event.target as HTMLInputElement).value;
							},
						}),
						m('textarea.text-input.materials-editor__textarea', {
							rows: 4,
							placeholder: t('mat.text_ph'),
							'aria-label': t('mat.text_ph'),
							value: textBody,
							oninput: (event: InputEvent) => {
								textBody = (event.target as HTMLTextAreaElement).value;
								errorText = '';
							},
						}),
						m(
							'button.btn.btn--secondary',
							{ type: 'button', disabled: !!busy || full, onclick: () => addText(attrs) },
							t('mat.add_text'),
						),
					]),

					// Link
					m('.materials-editor__box.materials-editor__box--inline', [
						m('input.text-input.materials-editor__link', {
							type: 'url',
							inputmode: 'url',
							dir: 'ltr',
							placeholder: t('mat.link_ph'),
							'aria-label': t('mat.link_ph'),
							'aria-invalid': errorText ? 'true' : 'false',
							value: linkUrl,
							oninput: (event: InputEvent) => {
								linkUrl = (event.target as HTMLInputElement).value;
								errorText = '';
							},
							onkeydown: (event: KeyboardEvent) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									addLink(attrs);
								}
							},
						}),
						m(
							'button.btn.btn--secondary',
							{ type: 'button', disabled: !!busy || full, onclick: () => addLink(attrs) },
							t('mat.add_link'),
						),
					]),

					busy
						? m(
								'p.materials-editor__status',
								{ role: 'status' },
								progress !== undefined ? `${busy} ${progress}%` : busy,
							)
						: null,
					errorText ? m('p.materials-editor__error', { role: 'alert' }, errorText) : null,
				],
			);
		},
	};
}

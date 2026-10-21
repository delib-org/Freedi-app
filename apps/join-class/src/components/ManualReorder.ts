import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import {
	setManualOptionOrder,
	setManualOrganizerOrder,
	getVisibleOptions,
	getOrganizerSuggestions,
} from '@/lib/store';
import { t } from '@/lib/i18n';
import '../styles/ManualReorder.css';

export type ManualReorderMode = 'options' | 'organizers';

interface ManualReorderProps {
	questionId: string;
	mode?: ManualReorderMode;
	onClose: () => void;
}

let options: Statement[] = [];
let reorderedIds: string[] = [];
let draggedId: string | null = null;
let dragOverId: string | null = null;
let isSaving = false;

function getOptionsForMode(mode: ManualReorderMode): Statement[] {
	return mode === 'organizers' ? getOrganizerSuggestions() : getVisibleOptions();
}

function persistOrder(mode: ManualReorderMode, questionId: string, ids: string[]): Promise<void> {
	return mode === 'organizers'
		? setManualOrganizerOrder(questionId, ids)
		: setManualOptionOrder(questionId, ids);
}

function getTitle(mode: ManualReorderMode): string {
	if (mode === 'organizers') {
		return t('admin.manual_sort_title.organizers') || 'Manually Reorder Organizer Suggestions';
	}

	return t('admin.manual_sort_title') || 'Manually Reorder Solutions';
}

function getHelpText(mode: ManualReorderMode): string {
	if (mode === 'organizers') {
		return t('admin.manual_sort_help.organizers') || 'Drag organizer suggestions to reorder them';
	}

	return t('admin.manual_sort_help') || 'Drag solutions to reorder them';
}

export const ManualReorder: m.Component<ManualReorderProps> = {
	oninit(vnode) {
		const mode = vnode.attrs.mode ?? 'options';
		options = getOptionsForMode(mode);
		reorderedIds = options.map((o) => o.statementId);
		draggedId = null;
		dragOverId = null;
	},

	view({ attrs: { questionId, mode = 'options', onClose } }) {
		return m('.manual-reorder-modal', [
			m('.manual-reorder-overlay', {
				onclick: onClose,
			}),
			m('.manual-reorder-dialog', [
				m('.manual-reorder-header', [
					m('h2', getTitle(mode)),
					m(
						'button.manual-reorder-close',
						{
							onclick: onClose,
							'aria-label': t('close') || 'Close',
						},
						'×',
					),
				]),
				m('.manual-reorder-content', [
					m('.manual-reorder-help', getHelpText(mode)),
					m(
						'.manual-reorder-list',
						reorderedIds.map((id, idx) => {
							const option = options.find((o) => o.statementId === id);
							if (!option) return null;

							const isBeingDragged = draggedId === id;
							const isDragOver = dragOverId === id;

							return m(
								`.manual-reorder-item${isBeingDragged ? '.dragging' : ''}${isDragOver ? '.dragover' : ''}`,
								{
									key: id,
									draggable: true,
									ondragstart: (e: DragEvent) => {
										draggedId = id;
										if (e.dataTransfer) {
											e.dataTransfer.effectAllowed = 'move';
											e.dataTransfer.setData('text/plain', id);
										}
									},
									ondragend: () => {
										draggedId = null;
										dragOverId = null;
										m.redraw();
									},
									ondragover: (e: DragEvent) => {
										e.preventDefault();
										if (e.dataTransfer) {
											e.dataTransfer.dropEffect = 'move';
										}
										dragOverId = id;
										m.redraw();
									},
									ondragleave: () => {
										dragOverId = null;
										m.redraw();
									},
									ondrop: (e: DragEvent) => {
										e.preventDefault();
										e.stopPropagation();
										const draggedItemId = e.dataTransfer?.getData('text/plain');
										if (draggedItemId && draggedItemId !== id) {
											const draggedIdx = reorderedIds.indexOf(draggedItemId);
											const targetIdx = reorderedIds.indexOf(id);
											if (draggedIdx !== -1 && targetIdx !== -1) {
												const newOrder = [...reorderedIds];
												newOrder.splice(draggedIdx, 1);
												newOrder.splice(targetIdx, 0, draggedItemId);
												reorderedIds = newOrder;
											}
										}
										draggedId = null;
										dragOverId = null;
										m.redraw();
									},
								},
								[
									m('.manual-reorder-drag-handle', '⋮⋮'),
									m('.manual-reorder-number', `${idx + 1}`),
									m('.manual-reorder-text', option.statement),
									m('.manual-reorder-dropzone'),
								],
							);
						}),
					),
				]),
				m('.manual-reorder-footer', [
					m(
						'button.btn.btn--outline',
						{
							type: 'button',
							onclick: onClose,
							...(isSaving ? { disabled: true } : {}),
						},
						t('cancel') || 'Cancel',
					),
					m(
						'button.btn.btn--primary',
						{
							type: 'button',
							onclick: () => {
								if (isSaving) return;
								isSaving = true;
								m.redraw();
								persistOrder(mode, questionId, reorderedIds)
									.then(() => {
										onClose();
									})
									.catch((error) => {
										console.error('Failed to save manual order:', error);
										isSaving = false;
										m.redraw();
									});
							},
							...(isSaving ? { disabled: true } : {}),
						},
						isSaving ? t('saving') || 'Saving...' : t('save') || 'Save Order',
					),
				]),
			]),
		]);
	},
};

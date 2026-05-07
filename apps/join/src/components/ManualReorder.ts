import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import { setManualOptionOrder, getVisibleOptions } from '@/lib/store';
import { t } from '@/lib/i18n';
import '../styles/ManualReorder.css';

interface ManualReorderProps {
	questionId: string;
	onClose: () => void;
}

let options: Statement[] = [];
let reorderedIds: string[] = [];
let draggedId: string | null = null;
let isSaving = false;

export const ManualReorder: m.Component<ManualReorderProps> = {
	oninit(vnode) {
		options = getVisibleOptions();
		reorderedIds = options.map((o) => o.statementId);
	},

	view({ attrs: { questionId, onClose } }) {
		return m('.manual-reorder-modal', [
			m('.manual-reorder-overlay', {
				onclick: onClose,
			}),
			m('.manual-reorder-dialog', [
				m('.manual-reorder-header', [
					m('h2', t('admin.manual_sort_title') || 'Manually Reorder Solutions'),
					m('button.manual-reorder-close', {
						onclick: onClose,
						'aria-label': t('close') || 'Close',
					}, '×'),
				]),
				m('.manual-reorder-content', [
					m('.manual-reorder-help', t('admin.manual_sort_help') || 'Drag solutions to reorder them'),
					m('.manual-reorder-list', reorderedIds.map((id, idx) => {
						const option = options.find((o) => o.statementId === id);
						if (!option) return null;

						return m(`.manual-reorder-item${draggedId === id ? '.dragging' : ''}`, {
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
							},
							ondragover: (e: DragEvent) => {
								e.preventDefault();
								if (e.dataTransfer) {
									e.dataTransfer.dropEffect = 'move';
								}
							},
							ondrop: (e: DragEvent) => {
								e.preventDefault();
								const draggedItemId = e.dataTransfer?.getData('text/plain');
								if (draggedItemId && draggedItemId !== id) {
									const draggedIdx = reorderedIds.indexOf(draggedItemId);
									const targetIdx = reorderedIds.indexOf(id);
									if (draggedIdx !== -1 && targetIdx !== -1) {
										const newOrder = [...reorderedIds];
										newOrder.splice(draggedIdx, 1);
										newOrder.splice(targetIdx, 0, draggedItemId);
										reorderedIds = newOrder;
										m.redraw();
									}
								}
								draggedId = null;
							},
						}, [
							m('.manual-reorder-drag-handle', '⋮⋮'),
							m('.manual-reorder-number', `${idx + 1}`),
							m('.manual-reorder-text', option.statement),
						]);
					})),
				]),
				m('.manual-reorder-footer', [
					m('button.btn.btn--outline', {
						onclick: onClose,
					}, t('cancel') || 'Cancel'),
					m('button.btn.btn--primary', {
						onclick: async () => {
							isSaving = true;
							m.redraw();
							try {
								await setManualOptionOrder(questionId, reorderedIds);
								onClose();
							} catch (error) {
								console.error('Failed to save manual order:', error);
								isSaving = false;
								m.redraw();
							}
						},
						disabled: isSaving,
					}, isSaving ? t('saving') || 'Saving...' : t('save') || 'Save Order'),
				]),
			]),
		]);
	},
};

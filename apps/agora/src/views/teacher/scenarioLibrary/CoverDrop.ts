import m from 'mithril';
import { Icon } from '../../../components/Icon';
import { COVER_TYPES, type CoverProblem } from '../../../lib/scenarioLibrary/coverRules';
import { t } from '../../../lib/i18n';

export interface CoverDropAttrs {
	id: string;
	/** What the cover looks like now: the published one, or the picture just chosen */
	previewUrl: string | null;
	/** 0-100 while a picture is uploading, else null */
	progress: number | null;
	problem: CoverProblem | 'failed' | null;
	onFile: (file: File) => void;
	onRemove: () => void;
}

/**
 * Drag a picture onto the box, or press it to pick one. Never a URL field:
 * the file goes through the browser, is shrunk there, and is uploaded under
 * the scenario's own folder.
 */
export function CoverDrop(): m.Component<CoverDropAttrs> {
	let over = false;
	let input: HTMLInputElement | null = null;

	function take(files: FileList | null | undefined, attrs: CoverDropAttrs): void {
		const file = files?.[0];
		if (file) attrs.onFile(file);
	}

	return {
		view({ attrs }) {
			const { id, previewUrl, progress, problem, onRemove } = attrs;
			const busy = progress !== null;
			const errorKey =
				problem === 'type'
					? 'scenlib.cover_type_bad'
					: problem === 'size'
						? 'scenlib.cover_size_bad'
						: problem === 'failed'
							? 'scenlib.cover_failed'
							: null;

			return m('.scn-cover', [
				m('span.scn-field__label', { id: `${id}-label` }, t('scenlib.cover')),
				m(
					'.scn-cover__zone',
					{
						id,
						role: 'button',
						tabindex: 0,
						'aria-labelledby': `${id}-label`,
						'aria-describedby': `${id}-hint`,
						class: over
							? 'scn-cover__zone--over'
							: previewUrl
								? 'scn-cover__zone--filled'
								: undefined,
						onclick: () => input?.click(),
						onkeydown: (event: KeyboardEvent) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								input?.click();
							}
						},
						ondragenter: (event: DragEvent) => {
							event.preventDefault();
							over = true;
						},
						ondragover: (event: DragEvent) => {
							event.preventDefault();
							over = true;
						},
						ondragleave: () => {
							over = false;
						},
						ondrop: (event: DragEvent) => {
							event.preventDefault();
							over = false;
							take(event.dataTransfer?.files, attrs);
						},
					},
					[
						previewUrl ? m('img.scn-cover__img', { src: previewUrl, alt: '' }) : null,
						m('span.scn-cover__prompt', [
							m(Icon, { name: 'image', size: 30 }),
							m(
								'span',
								busy
									? t('scenlib.cover_uploading', { percent: progress ?? 0 })
									: previewUrl
										? t('scenlib.cover_replace')
										: t('scenlib.cover_drop'),
							),
						]),
						busy
							? m(
									'span.scn-cover__bar',
									{
										role: 'progressbar',
										'aria-valuenow': progress ?? 0,
										'aria-valuemin': 0,
										'aria-valuemax': 100,
									},
									m('span.scn-cover__bar-fill', { style: { inlineSize: `${progress ?? 0}%` } }),
								)
							: null,
					],
				),
				m('input.sr-only', {
					type: 'file',
					accept: COVER_TYPES.join(','),
					tabindex: -1,
					'aria-hidden': 'true',
					oncreate: ({ dom }: m.VnodeDOM) => {
						input = dom as HTMLInputElement;
					},
					onchange: (event: Event) => {
						const target = event.target as HTMLInputElement;
						take(target.files, attrs);
						target.value = '';
					},
				}),
				m('p.scn-field__hint', { id: `${id}-hint` }, t('scenlib.cover_hint')),
				errorKey ? m('p.scn-field__error', { role: 'alert' }, t(errorKey)) : null,
				previewUrl && !busy
					? m(
							'button.btn.btn--ghost.btn--sm',
							{ type: 'button', onclick: onRemove },
							t('scenlib.cover_remove'),
						)
					: null,
			]);
		},
	};
}

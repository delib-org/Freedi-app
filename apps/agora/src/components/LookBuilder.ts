import m from 'mithril';
import { getLang, t } from '../lib/i18n';
import { LOOK_SWATCHES, SEED_ORDER, DEFAULT_SEEDS } from '../lib/looks';
import { fontsFor, fontStack, loadFont, type PlayfulFont } from '../lib/fonts';
import { AGORA_THEME, AgoraThemeSeeds } from '@freedi/shared-types';

export interface LookBuilderAttrs {
	/** Where the builder opens: my last look, or candy's seeds for a first one */
	initialName?: string;
	initialSeeds?: AgoraThemeSeeds;
	initialFont?: string;
	onSave: (name: string, seeds: AgoraThemeSeeds, font: string | undefined) => void;
	onCancel: () => void;
}

const SEED_LABEL: Record<keyof AgoraThemeSeeds, string> = {
	page: 'look.seed_page',
	mine: 'look.seed_mine',
	peer: 'look.seed_peer',
	go: 'look.seed_go',
};

/**
 * Four rows of swatches and a name, with the look growing live in a preview
 * card above them. The preview is painted the way the app itself is — the
 * seeds set as custom properties on the preview root, and the stylesheet
 * deriving the rest — so what the student sees while choosing IS what the
 * whole screen will become when they press "wear it".
 *
 * Swatches, not a colour wheel: every MINE and PEER swatch holds white text at
 * AA on its own and every GO swatch holds dark ink, so a built look cannot
 * be unreadable. See lib/looks.ts for the measured lists.
 */
export function LookBuilder(
	initialVnode: m.Vnode<LookBuilderAttrs>,
): m.Component<LookBuilderAttrs> {
	let name = initialVnode.attrs.initialName ?? '';
	let seeds: AgoraThemeSeeds = { ...(initialVnode.attrs.initialSeeds ?? DEFAULT_SEEDS) };
	let font: string | undefined = initialVnode.attrs.initialFont;
	// The faces with glyphs for the language on screen; each chip is set in
	// its own face, so the files are fetched the moment the builder opens
	const fonts: readonly PlayfulFont[] = fontsFor(getLang());
	for (const candidate of fonts) void loadFont(candidate.id);

	return {
		view(vnode) {
			const { onSave, onCancel } = vnode.attrs;
			const ready = name.trim().length >= AGORA_THEME.MIN_NAME_LENGTH;
			const chosenFont = fonts.find((candidate) => candidate.id === font);

			return m('.look-builder', [
				m(
					'.look-preview',
					{
						style: {
							'--seed-page': seeds.page,
							'--seed-mine': seeds.mine,
							'--seed-peer': seeds.peer,
							'--seed-go': seeds.go,
							...(chosenFont ? { '--font-display': fontStack(chosenFont) } : {}),
						},
					},
					[
						m('.look-preview__bubble.look-preview__bubble--mine', t('look.preview_mine')),
						m('.look-preview__bubble.look-preview__bubble--peer', t('look.preview_peer')),
						m('.look-preview__row', [
							m('.look-preview__meter', m('span')),
							m('span.look-preview__go', t('look.preview_go')),
						]),
					],
				),

				m('label.look-builder__field', [
					m('span.look-builder__label', t('look.name')),
					m('input.text-input', {
						type: 'text',
						value: name,
						maxlength: AGORA_THEME.MAX_NAME_LENGTH,
						placeholder: t('look.name_ph'),
						oninput: (event: InputEvent) => {
							name = (event.target as HTMLInputElement).value;
						},
					}),
				]),

				SEED_ORDER.map((seed) =>
					m('.look-builder__seed', { key: seed }, [
						m('span.look-builder__label', t(SEED_LABEL[seed])),
						m(
							'.look-builder__swatches',
							{ role: 'radiogroup', 'aria-label': t(SEED_LABEL[seed]) },
							LOOK_SWATCHES[seed].map((swatch) =>
								m('button.look-swatch', {
									key: swatch.hex,
									type: 'button',
									role: 'radio',
									class: seeds[seed] === swatch.hex ? 'look-swatch--on' : undefined,
									'aria-checked': seeds[seed] === swatch.hex ? 'true' : 'false',
									'aria-label': t(swatch.nameKey),
									title: t(swatch.nameKey),
									style: { backgroundColor: swatch.hex },
									onclick: () => {
										seeds = { ...seeds, [seed]: swatch.hex };
									},
								}),
							),
						),
					]),
				),

				// The face: a row of chips, each set in the face it names, so the
				// choice is made by eye and not by name. The first chip is the app's
				// own face — a look does not have to be loud to be yours.
				m('.look-builder__seed', [
					m('span.look-builder__label', t('look.seed_font')),
					m('.look-builder__fonts', { role: 'radiogroup', 'aria-label': t('look.seed_font') }, [
						m(
							'button.look-font',
							{
								key: 'default',
								type: 'button',
								role: 'radio',
								class: font === undefined ? 'look-font--on' : undefined,
								'aria-checked': font === undefined ? 'true' : 'false',
								onclick: () => {
									font = undefined;
								},
							},
							[
								m('span.look-font__sample', t('look.font_sample')),
								m('span.look-font__name', t('look.font_default')),
							],
						),
						...fonts.map((candidate) =>
							m(
								'button.look-font',
								{
									key: candidate.id,
									type: 'button',
									role: 'radio',
									class: font === candidate.id ? 'look-font--on' : undefined,
									'aria-checked': font === candidate.id ? 'true' : 'false',
									style: { fontFamily: fontStack(candidate) },
									onclick: () => {
										font = candidate.id;
									},
								},
								[
									m('span.look-font__sample', t('look.font_sample')),
									m('span.look-font__name', candidate.family),
								],
							),
						),
					]),
				]),

				m('.look-builder__actions', [
					m(
						'button.btn.btn--primary',
						{ disabled: !ready, onclick: () => onSave(name.trim(), seeds, font) },
						t('look.wear_it'),
					),
					m('button.btn.btn--ghost', { onclick: onCancel }, t('common.cancel')),
				]),
			]);
		},
	};
}

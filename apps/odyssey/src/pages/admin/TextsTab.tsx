import { useState } from 'react';
import { useT } from '../../i18n/useT';

/** Game text keys with a labelled row; any other key saved on the game shows as itself. */
const TEXT_KEYS = [
	'gameTitle',
	'gameSubtitle',
	'introMotto',
	'introWelcome',
	'introBody',
	'introLine1',
	'introLine2',
	'startButton',
	'compassTitle',
	'compassIntro',
	'mapTitle',
	'mapIntro',
	'voyageShipsNote',
	'summaryTitle',
	'summaryIntro',
	'agoraQuestion',
	'agoraButton',
	'agoraOrigin',
	'destinationName',
	'privacyController',
	'privacyContact',
] as const;

const LABELLED = new Set<string>(TEXT_KEYS);

export default function TextsTab({
	texts,
	busy,
	onSave,
}: {
	texts: Record<string, string>;
	busy: boolean;
	onSave: (texts: Record<string, string>) => void;
}) {
	const { t } = useT();
	const [draft, setDraft] = useState<Record<string, string>>({ ...texts });
	const keys = [...new Set([...TEXT_KEYS, ...Object.keys(draft)])];

	return (
		<section className="panel flex flex-col gap-3">
			{keys.map((key) => (
				<label key={key} className="flex flex-col gap-1">
					<span className="text-[13px] text-[var(--gold-strong)]">
						{LABELLED.has(key) ? t(`admin.text.${key}`) : key}
					</span>
					{(draft[key] ?? '').length > 60 ? (
						<textarea
							rows={2}
							value={draft[key] ?? ''}
							onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
						/>
					) : (
						<input
							type="text"
							value={draft[key] ?? ''}
							onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
						/>
					)}
				</label>
			))}
			<button
				type="button"
				className="btn self-center"
				disabled={busy}
				onClick={() => onSave(draft)}
			>
				{t('admin.texts.save')}
			</button>
		</section>
	);
}

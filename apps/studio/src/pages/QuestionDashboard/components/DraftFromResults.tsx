import { useEffect, useMemo, useState, type FC } from 'react';
import { StatementType } from '@freedi/shared-types';
import type { DerivedActivity } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { DraftSettingsFields } from '@/components/atomic/molecules/DraftSettingsFields';
import { studioDraftFromResults, type StudioDraftFromResultsResult } from '@/db/orgFunctions';
import { useChildren } from '@/db/orgStatements';
import { getErrorCode } from '@/pages/_shared/callableErrors';
import { defaultDraftSettings, isCutoffValid, type DraftSettings } from '@/utils/draftSettings';
import { logError } from '@/utils/logError';
import ConfirmDialog from './ConfirmDialog';

/**
 * DraftFromResults — the "Draft from results" section of a document's
 * drawer: pick sources, cutoff and intent, then have the text written from
 * the sources' top suggestions (10–40 s). If the document already has
 * paragraphs, asks before replacing them.
 * Styles: styles/organisms/_drawer.scss (.drawer__draft*)
 */
export interface DraftFromResultsProps {
	document: DerivedActivity;
	activities: DerivedActivity[];
	/** Sign editor link, shown after a successful draft. */
	editorHref?: string;
	onDrafted?: (result: StudioDraftFromResultsResult) => void;
}

type DraftPhase = 'idle' | 'writing' | 'done' | 'error';

const DraftFromResults: FC<DraftFromResultsProps> = ({
	document,
	activities,
	editorHref,
	onDrafted,
}) => {
	const { t, tWithParams } = useTranslation();
	const documentId = document.statementId;
	const { data: children } = useChildren(documentId);
	const hasParagraphs = useMemo(
		() => children.some((child) => child.statementType === StatementType.paragraph),
		[children],
	);

	const [settings, setSettings] = useState<DraftSettings>(() =>
		defaultDraftSettings(activities, documentId),
	);
	const [phase, setPhase] = useState<DraftPhase>('idle');
	const [confirming, setConfirming] = useState(false);
	const [result, setResult] = useState<StudioDraftFromResultsResult | null>(null);
	const [error, setError] = useState('');

	// A different document → fresh defaults.
	useEffect(() => {
		setSettings(defaultDraftSettings(activities, documentId));
		setPhase('idle');
		setResult(null);
		setError('');
		// Sources are re-derived only when the document changes, not on every
		// activities refresh — the admin's selection must survive live updates.
	}, [documentId]);

	const canWrite =
		phase !== 'writing' && settings.sourceStatementIds.length > 0 && isCutoffValid(settings.cutoff);

	const write = async () => {
		setPhase('writing');
		setError('');
		try {
			const next = await studioDraftFromResults({
				documentId,
				sourceStatementIds: settings.sourceStatementIds,
				cutoff: settings.cutoff,
				intent: settings.intent.trim() || undefined,
			});
			setResult(next);
			setPhase('done');
			onDrafted?.(next);
		} catch (err) {
			logError(err, {
				operation: 'DraftFromResults.write',
				statementId: documentId,
				metadata: { sources: settings.sourceStatementIds.length, mode: settings.cutoff.mode },
			});
			const code = getErrorCode(err) ?? '';
			setError(
				code.endsWith('failed-precondition')
					? t('No suggestions pass this cutoff yet. Lower it, or wait for more ratings.')
					: t('The draft could not be written. Please try again.'),
			);
			setPhase('error');
		}
	};

	const handleWriteClick = () => {
		if (!canWrite) return;
		if (hasParagraphs) setConfirming(true);
		else void write();
	};

	return (
		<div className="drawer__draft">
			<DraftSettingsFields
				activities={activities}
				excludeId={documentId}
				value={settings}
				onChange={setSettings}
				disabled={phase === 'writing'}
			/>

			<div className="drawer__draft-actions">
				<Button
					text={hasParagraphs ? t('Rewrite the draft') : t('Write the draft')}
					variant="primary"
					fullWidth
					disabled={!canWrite}
					loading={phase === 'writing'}
					onClick={handleWriteClick}
				/>
				{phase === 'writing' && (
					<p className="drawer__draft-progress" role="status" aria-live="polite">
						{t('Writing… this takes up to a minute.')}
					</p>
				)}
				{phase === 'done' && result && (
					<p className="drawer__draft-done" role="status" aria-live="polite">
						{tWithParams('{{count}} paragraphs written · {{gaps}} open gaps', {
							count: result.paragraphCount,
							gaps: result.openGaps,
						})}
						{' — '}
						<a
							className="drawer__draft-link"
							href={editorHref ?? result.signAdminUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							{t('review it in Sign')}
						</a>
					</p>
				)}
				{phase === 'error' && error && (
					<p className="drawer__draft-error" role="alert">
						{error}
					</p>
				)}
			</div>

			<ConfirmDialog
				isOpen={confirming}
				title={t('Replace the current text?')}
				text={t(
					'The paragraphs the AI wrote last time will be replaced by a new draft. Paragraphs you wrote yourself are kept.',
				)}
				confirmLabel={t('Replace')}
				danger
				operation="DraftFromResults.confirmReplace"
				onConfirm={() => {
					setConfirming(false);

					return write();
				}}
				onCancel={() => setConfirming(false)}
			/>
		</div>
	);
};

export default DraftFromResults;

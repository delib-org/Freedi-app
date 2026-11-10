import { logError } from '@/utils/errorHandling';
import { useCallback, useEffect, useState } from 'react';
import { Statement, DeliberationStatus } from '@freedi/shared-types';
import {
	requestDeliberation as call,
	createAgreementHandoff,
	DELIBERATION_POLL_MS,
} from '@/controllers/db/deliberation';
import { useSelector } from 'react-redux';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { formatScore } from '@/helpers/scoreFormat';
import SubGroupCardSummary from '@/view/components/subGroupCard/SubGroupCardSummary';
import AgreementStatus from './AgreementStatus';
import styles from './Agreement.module.scss';
import processStyles from './QuestionProcess.module.scss';

const signBase =
	import.meta.env.VITE_SIGN_APP_URL ||
	(import.meta.env.DEV ? 'http://localhost:3002' : 'https://sign.wizcol.com');
export default function QuestionProcess({
	statement,
	view,
	variant = 'page',
	showScores = true,
}: {
	statement: Statement;
	view: 'overview' | 'summary' | 'covenant';
	/** `card` = the compact סיכום card inside the Results tab. */
	variant?: 'page' | 'card';
	/** False leaves the agreement numbers off, for a viewer the score guard holds back. */
	showScores?: boolean;
}) {
	const isCard = variant === 'card';
	// One summary per question: the live statement's own, same as on the question card.
	const liveStatement = useSelector(statementSelector(statement.statementId)) ?? statement;
	const { t } = useTranslation();
	const [data, setData] = useState<DeliberationStatus>();
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState('');
	const [selected, setSelected] = useState<string[]>([]);
	const refresh = useCallback(async () => {
		try {
			setData((await call({ questionId: statement.statementId })).data);
			setError('');
		} catch (e) {
			if (!(e instanceof Error && e.name === 'AbortError'))
				logError(e, { operation: 'QuestionProcess' });
			setError(t('Could not complete action.'));
		}
	}, [statement.statementId, t]);
	useEffect(() => {
		void refresh();
		const timer = setInterval(() => {
			if (!document.hidden) void refresh();
		}, DELIBERATION_POLL_MS);

		return () => clearInterval(timer);
	}, [refresh]);
	async function act(action: string, extra: Record<string, unknown> = {}) {
		setBusy(true);
		setError('');
		try {
			setData((await call({ questionId: statement.statementId, action, ...extra })).data);
		} catch (e) {
			if (!(e instanceof Error && e.name === 'AbortError'))
				logError(e, { operation: 'QuestionProcess' });
			setError(t('Could not complete action.'));
		} finally {
			setBusy(false);
		}
	}
	async function openSign(documentId: string) {
		setBusy(true);
		setError('');
		try {
			const response = await createAgreementHandoff({ documentId });
			window.location.assign(
				`${signBase}/doc/${documentId}#freedi-handoff=${encodeURIComponent(response.data.code)}`,
			);
		} catch (e) {
			if (!(e instanceof Error && e.name === 'AbortError'))
				logError(e, { operation: 'QuestionProcess' });
			setError(t('Could not open Sign.'));
			setBusy(false);
		}
	}

	async function invite() {
		const url = `${window.location.origin}/statement/${statement.statementId}`;
		try {
			if (navigator.share)
				await navigator.share({
					title: statement.statement,
					text: t('Let’s solve this together'),
					url,
				});
			else {
				await navigator.clipboard.writeText(url);
				setNotice(t('Invitation link copied'));
			}
		} catch (e) {
			if (!(e instanceof Error && e.name === 'AbortError'))
				logError(e, { operation: 'QuestionProcess' });
			if (!(e instanceof Error && e.name === 'AbortError')) setNotice(url);
		}
	}

	return (
		<section
			className={
				isCard
					? `${processStyles.process} ${processStyles['process--card']}`
					: `${styles.journey__section} ${processStyles.process}`
			}
			aria-label={isCard ? t('Summary') : t('From question to agreement')}
			data-testid={isCard ? 'results-summary' : undefined}
		>
			{view === 'overview' && (
				<div className={styles.journey__card} data-tone="yellow">
					<h3>{t('Who can help us solve this?')}</h3>
					<p>{t('Invite people to propose, evaluate and find a way forward together.')}</p>
					<button onClick={() => void invite()}>{t('Invite people to participate')}</button>
					{notice && <p role="status">{notice}</p>}
				</div>
			)}
			{error && <p role="alert">{error}</p>}
			{data?.canManage && (
				<div className={styles.journey__actions}>
					<label>
						<input
							type="checkbox"
							checked={data.automatic}
							disabled={busy}
							onChange={(e) => void act('enable', { enabled: e.target.checked })}
						/>
						{t('Automatic summaries and agreement drafts')}
					</label>
					<small>
						{t(
							'Summaries update every 24 hours when agreed proposals change. Drafts start when all selected proposals reach 70% Cp.',
						)}
					</small>
				</div>
			)}
			{view !== 'overview' && showScores && !!data?.sources.length && (
				<details>
					<summary>
						{t(data.sources.length > 1 ? 'Original answers' : 'Source solution')} ·{' '}
						{data.sources.length}
					</summary>
					{data.sources.map((source) => (
						<p key={source.id}>
							<a href={`/statement/${source.id}`}>{source.text}</a> · {t('Agreement score')}{' '}
							<span dir="ltr">{formatScore(source.cp)}</span>
						</p>
					))}
				</details>
			)}
			{view === 'summary' && (
				<>
					<div className={processStyles.process__head}>
						<h2>{isCard ? t('Summary') : t('Summary of agreed proposals')}</h2>
					</div>
					<SubGroupCardSummary
						statement={liveStatement}
						summary={liveStatement.summary ?? ''}
						isAdmin={data?.canManage === true}
					/>
				</>
			)}
			{view === 'covenant' && (
				<>
					<h2>{t('Our agreements')}</h2>
					<p>
						{t(
							'Read the introduction here. Develop and evaluate the full wording in Sign. Each agreement needs its own 70% Cp.',
						)}
					</p>
					{data?.canManage && (
						<button disabled={busy || !data.sources.length} onClick={() => void act('agreement')}>
							{busy ? t('Working…') : t('Draft an agreement from agreed proposals')}
						</button>
					)}
					{!data?.agreements.length && (
						<p>{t('No agreements yet. Start with proposals that pass the cutoff.')}</p>
					)}
					<div className={styles.journey__grid}>
						{data?.agreements.map((a) => (
							<article
								className={styles.journey__card}
								data-tone={showScores && a.agreed ? 'mint' : 'peach'}
								key={a.id}
							>
								<AgreementStatus
									agreed={a.agreed}
									cp={a.cp}
									evaluators={a.evaluators}
									showScores={showScores}
								/>
								<h3>{a.title}</h3>
								<p>{a.introduction}</p>
								{a.previousId && (
									<small>
										{t(a.kind === 'alternative' ? 'Alternative wording' : 'New version')}
									</small>
								)}
								<button disabled={busy} onClick={() => void openSign(a.id)}>
									{t('Read, improve and evaluate in Sign')} ↗
								</button>
								{data.canManage && (
									<label>
										<input
											type="checkbox"
											checked={selected.includes(a.id)}
											onChange={(e) =>
												setSelected((v) =>
													e.target.checked ? [...v, a.id] : v.filter((id) => id !== a.id),
												)
											}
										/>
										{t('Include in the vote')}
									</label>
								)}
							</article>
						))}
					</div>
					{data?.canManage && data.agreements.length > 1 && (
						<div className={styles.journey__card} data-tone="yellow">
							<h3>{t('Do we need one shared decision?')}</h3>
							<p>
								{t(
									'Local groups can choose different paths. When one decision is needed, compare the alternatives in Vote.',
								)}
							</p>
							<button
								disabled={busy || selected.length < 2}
								onClick={() =>
									void act('vote', {
										documentIds: selected,
										title: statement.statement + ' — ' + t('Choose an agreement'),
									})
								}
							>
								{t('Open a vote between alternatives')}
							</button>
						</div>
					)}
					{data?.ballots.map((b) => (
						<p key={b.id}>
							<a href={`/statement/${b.id}?tab=options`}>
								{t('Open Vote')}: {b.title} ↗
							</a>
							{b.result ? (
								<span>
									{' '}
									— {t('Selected for implementation')}: {b.result.title}
								</span>
							) : (
								data.canManage && (
									<button
										disabled={busy}
										onClick={() => void act('finalizeVote', { ballotId: b.id })}
									>
										{t('Close vote and record the result')}
									</button>
								)
							)}
						</p>
					))}
				</>
			)}
		</section>
	);
}

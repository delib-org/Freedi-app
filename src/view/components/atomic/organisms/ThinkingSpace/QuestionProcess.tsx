import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Statement, DeliberationStatus } from '@freedi/shared-types';
import { functions } from '@/controllers/db/config';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './Agreement.module.scss';
import processStyles from './QuestionProcess.module.scss';

const call = httpsCallable<Record<string, unknown>, DeliberationStatus>(functions, 'deliberation', {
	timeout: 540000,
});
const signBase =
	import.meta.env.VITE_SIGN_APP_URL ||
	(import.meta.env.DEV ? 'http://localhost:3012' : 'https://sign.wizcol.com');
export default function QuestionProcess({
	statement,
	view,
}: {
	statement: Statement;
	view: 'overview' | 'summary' | 'covenant';
}) {
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
			setError(e instanceof Error ? e.message : 'Could not load process.');
		}
	}, [statement.statementId]);
	useEffect(() => {
		void refresh();
		const timer = setInterval(() => {
			if (!document.hidden) void refresh();
		}, 15000);

		return () => clearInterval(timer);
	}, [refresh]);
	async function act(action: string, extra: Record<string, unknown> = {}) {
		setBusy(true);
		setError('');
		try {
			setData((await call({ questionId: statement.statementId, action, ...extra })).data);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Could not complete action.');
		} finally {
			setBusy(false);
		}
	}
	async function openSign(documentId: string) {
		setBusy(true);
		setError('');
		try {
			const response = await httpsCallable<{ documentId: string }, { code: string }>(
				functions,
				'createAgreementHandoff',
			)({ documentId });
			window.location.assign(
				`${signBase}/doc/${documentId}#freedi-handoff=${encodeURIComponent(response.data.code)}`,
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : t('Could not open Sign.'));
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
			if (!(e instanceof Error && e.name === 'AbortError')) setNotice(url);
		}
	}

	return (
		<section
			className={`${styles.journey__section} ${processStyles.process}`}
			aria-label={t('From question to agreement')}
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
			{view !== 'overview' && !!data?.sources.length && (
				<details>
					<summary>
						{t('Source solution')} · {data.sources.length}
					</summary>
					{data.sources.map((source) => (
						<p key={source.id}>
							<a href={`/statement/${source.id}`}>{source.text}</a> · Cp{' '}
							{Math.round(source.cp * 100)}%
						</p>
					))}
				</details>
			)}
			{view === 'summary' && (
				<>
					<h2>{t('Summary of agreed proposals')}</h2>
					<p>{data?.summary || t('No summary yet')}</p>
					{!!data?.summaryAt && <small>{new Date(data.summaryAt).toLocaleString()}</small>}
					{data?.summaryStale && (
						<p>{t('Agreed proposals have changed since the last summary.')}</p>
					)}
					{data?.canManage && (
						<button disabled={busy} onClick={() => void act('summary')}>
							{busy ? t('Working…') : t('Update summary')}
						</button>
					)}
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
								data-tone={a.agreed ? 'mint' : 'peach'}
								key={a.id}
							>
								<span>
									{t(a.agreed ? 'Passed the agreement threshold' : 'Draft for review')} · Cp{' '}
									{Math.round(a.cp * 100)}% · {a.evaluators} {t('People evaluated')}
								</span>
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

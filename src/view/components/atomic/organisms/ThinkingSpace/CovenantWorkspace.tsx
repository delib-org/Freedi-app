import { FormEvent, useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import {
	Statement,
	CovenantAction,
	CovenantResponse,
	CovenantRecord,
	CovenantReview,
	covenantReadiness,
} from '@freedi/shared-types';
import { functions } from '@/controllers/db/config';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './Agreement.module.scss';

const call = httpsCallable<
	{ questionId: string; action?: CovenantAction; expectedRevision?: number },
	CovenantResponse
>(functions, 'covenantWorkflow');
const value = (event: FormEvent<HTMLFormElement>, key: string): string =>
	String(new FormData(event.currentTarget).get(key) || '').trim();
function exportDocument(record: CovenantRecord, review?: CovenantReview): void {
	const clauses = review?.clauses || record.clauses;
	const lines = [
		`# ${review?.title || record.title}`,
		`Question ID: ${record.questionId}`,
		review
			? `Version ${review.version} · ${review.adoptedAt ? 'Adopted' : 'Review record'}`
			: 'Working draft — not adopted',
		'',
		...clauses.flatMap((c, i) => [
			`${i + 1}. ${c.text}`,
			`Source: ${c.sourceId}`,
			`Original source wording: ${c.sourceText}`,
			'',
		]),
	];
	if (review) {
		lines.push(
			'## Review rule',
			`${review.threshold}% endorsement; every named reviewer responds; zero objections.`,
			`Opened: ${new Date(review.openedAt).toISOString()}`,
			...review.reviewerIds.map(
				(uid) =>
					`${uid}: ${review.positions[uid]?.position || 'Not responded'}${review.positions[uid]?.reason ? ` — ${review.positions[uid].reason}` : ''}`,
			),
		);
		if (review.adoptedAt)
			lines.push(`Adopted: ${new Date(review.adoptedAt).toISOString()} by ${review.adoptedBy}`);
	}
	lines.push(
		'',
		'## Current discussion and amendments (may postdate this version)',
		...record.notes.map(
			(note) =>
				`${note.authorId} · ${new Date(note.createdAt).toISOString()} · ${note.status}\n${note.text}${note.proposedText ? '\nProposed wording: ' + note.proposedText : ''}`,
		),
	);
	const url = URL.createObjectURL(
		new Blob([lines.join('\n\n')], { type: 'text/markdown;charset=utf-8' }),
	);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = `covenant-${record.questionId}${review ? '-v' + review.version : '-draft'}.md`;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function CovenantWorkspace({
	statement,
	solutions,
}: {
	statement: Statement;
	solutions: Statement[];
}) {
	const { t } = useTranslation();
	const { user } = useAuthentication();
	const [data, setData] = useState<CovenantResponse>();
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);
	const refresh = useCallback(async (): Promise<void> => {
		try {
			const response = await call({ questionId: statement.statementId });
			setData((prev) =>
				!prev || response.data.record.revision >= prev.record.revision ? response.data : prev,
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : t('Could not load the covenant.'));
		} finally {
			setLoading(false);
		}
	}, [statement.statementId, t]);
	useEffect(() => {
		void refresh();
		const timer = setInterval(() => {
			if (!document.hidden) void refresh();
		}, 15000);

		return () => clearInterval(timer);
	}, [refresh]);
	const act = async (action: CovenantAction): Promise<boolean> => {
		if (!data || busy) return false;
		setBusy(true);
		setError('');
		try {
			const response = await call({
				questionId: statement.statementId,
				expectedRevision: data.record.revision,
				action,
			});
			setData(response.data);

			return true;
		} catch (e) {
			setError(e instanceof Error ? e.message : t('Could not save the covenant.'));
			await refresh();

			return false;
		} finally {
			setBusy(false);
		}
	};
	if (loading) return <p role="status">{t('Loading covenant…')}</p>;
	if (!data)
		return (
			<section>
				<p role="alert">{error}</p>
				<button onClick={() => void refresh()}>{t('Retry')}</button>
			</section>
		);
	const { record, members, canManage } = data;
	const latest = record.reviews.at(-1);
	const readiness = covenantReadiness(latest);
	const drafting = record.phase === 'draft';
	const review = record.phase === 'review';
	const yourPosition = user ? latest?.positions[user.uid] : undefined;

	return (
		<section aria-label={t('Shared covenant')}>
			<div className={styles.journey__title}>
				<div>
					<span className={styles.journey__eyebrow}>
						{t(
							record.phase === 'adopted'
								? 'Adopted covenant'
								: review
									? 'Review exact wording'
									: 'Working draft',
						)}
					</span>
					<h2>{t('Our covenant')} / אמנה</h2>
				</div>
				<button
					onClick={() => exportDocument(record, drafting ? undefined : latest)}
					disabled={!record.clauses.length}
				>
					{t('Export document')}
				</button>
			</div>
			<p>
				{t(
					'Develop the wording together. Every review preserves its exact text and its own responses.',
				)}
			</p>
			{error && <p role="alert">{error}</p>}
			<p className={styles.journey__muted}>
				{t('Saved revision')}: {record.revision} ·{' '}
				<button onClick={() => void refresh()}>{t('Refresh')}</button>
			</p>
			<fieldset disabled={busy} className={styles.journey__fieldset}>
				{canManage && drafting && (
					<form
						className={styles.journey__section}
						onSubmit={(event) => {
							event.preventDefault();
							void act({ type: 'title', text: value(event, 'title') });
						}}
					>
						<label>
							{t('Document title')}
							<input
								name="title"
								defaultValue={record.title}
								key={record.title}
								required
								maxLength={200}
							/>
						</label>
						<button>{t('Save title')}</button>
					</form>
				)}
				<div className={styles.journey__document}>
					<h3>{record.title}</h3>
					{!record.clauses.length && (
						<p>{t('Choose a solution below to begin the shared document.')}</p>
					)}
					{record.clauses.map((clause, i) => (
						<article key={clause.id} className={styles.journey__section}>
							<span className={styles.journey__eyebrow}>
								{t('Clause')} {i + 1}
							</span>
							<p>{clause.text}</p>
							<a href={`/statement/${clause.sourceId}?tab=chat`}>{t('Source solution')} ↗</a>
							{canManage && drafting && (
								<details>
									<summary>{t('Amend wording')}</summary>
									<form
										onSubmit={(event) => {
											event.preventDefault();
											void act({
												type: 'amend',
												clauseId: clause.id,
												text: value(event, 'wording'),
												reason: value(event, 'reason'),
											});
										}}
									>
										<label>
											{t('Proposed wording')}
											<textarea
												name="wording"
												defaultValue={clause.text}
												maxLength={1500}
												required
											/>
										</label>
										<label>
											{t('Why this change?')}
											<input name="reason" maxLength={1500} required />
										</label>
										<button>{t('Save amendment')}</button>
									</form>
									<form
										onSubmit={(event) => {
											event.preventDefault();
											void act({
												type: 'remove-clause',
												clauseId: clause.id,
												reason: value(event, 'reason'),
											});
										}}
									>
										<label>
											{t('Reason for removal')}
											<input name="reason" maxLength={1500} required />
										</label>
										<button>{t('Remove clause')}</button>
									</form>
								</details>
							)}
							{record.phase !== 'adopted' && (
								<details>
									<summary>{t('Comment or suggest wording')}</summary>
									<form
										onSubmit={async (event) => {
											event.preventDefault();
											const form = event.currentTarget;
											const ok = await act({
												type: 'note',
												clauseId: clause.id,
												text: value(event, 'comment'),
												proposedText: value(event, 'proposal'),
											});
											if (ok) form.reset();
										}}
									>
										<label>
											{t('Your comment')}
											<textarea name="comment" required maxLength={1500} />
										</label>
										<label>
											{t('Suggested wording (optional)')}
											<textarea name="proposal" maxLength={1500} />
										</label>
										<button>{t('Save comment')}</button>
									</form>
								</details>
							)}
							<div>
								{record.notes
									.filter((note) => note.clauseId === clause.id)
									.map((note) => (
										<div className={styles.journey__card} data-tone="peach" key={note.id}>
											<small>
												{note.authorId === user?.uid ? t('You') : note.authorId} · {t(note.status)}
											</small>
											<p>{note.text}</p>
											{note.proposedText && <blockquote>{note.proposedText}</blockquote>}
											{note.status === 'open' && canManage && drafting && note.proposedText && (
												<button onClick={() => void act({ type: 'accept-note', noteId: note.id })}>
													{t('Accept amendment')}
												</button>
											)}
											{note.status === 'open' && note.authorId === user?.uid && (
												<button
													onClick={() => void act({ type: 'withdraw-note', noteId: note.id })}
												>
													{t('Withdraw my note')}
												</button>
											)}
										</div>
									))}
							</div>
						</article>
					))}
				</div>
				{drafting && canManage && (
					<section className={styles.journey__section}>
						<h3>{t('Bring solutions into the covenant')}</h3>
						<p>{t('Wording is copied with its source. Evaluations are not transferred.')}</p>
						<div className={styles.journey__list}>
							{solutions
								.filter(
									(solution) =>
										!record.clauses.some((clause) => clause.sourceId === solution.statementId),
								)
								.map((solution) => (
									<button
										key={solution.statementId}
										onClick={() => void act({ type: 'add-clause', sourceId: solution.statementId })}
									>
										{solution.statement} +
									</button>
								))}
						</div>
					</section>
				)}
				{drafting && canManage && record.clauses.length > 0 && (
					<form
						className={styles.journey__card}
						data-tone="yellow"
						onSubmit={(event) => {
							event.preventDefault();
							const form = new FormData(event.currentTarget);
							void act({
								type: 'open-review',
								threshold: Number(form.get('threshold')),
								reviewerIds: form.getAll('reviewer').map(String),
							});
						}}
					>
						<h3>{t('Open review of exact wording')}</h3>
						<p>
							{t(
								'Choose the people who must review this version. Joining a discussion is not consent. Everyone selected must respond before adoption.',
							)}
						</p>
						<label>
							{t('Required endorsement (%)')}
							<input type="number" name="threshold" min={51} max={100} defaultValue={80} required />
						</label>
						<div className={styles.journey__list}>
							{members.map((member) => (
								<label key={member.uid}>
									<input type="checkbox" name="reviewer" value={member.uid} />
									{member.name}
									{member.uid === user?.uid ? ' · ' + t('You') : ''}
								</label>
							))}
						</div>
						<button>{t('Open review')}</button>
					</form>
				)}
				{!drafting && latest && (
					<section
						className={styles.journey__card}
						data-tone={record.phase === 'adopted' ? 'mint' : 'yellow'}
					>
						<h3>
							{t('Version')} {latest.version}
						</h3>
						<p>
							{readiness.endorsed} {t('endorse')} · {readiness.noObjection} {t('do not object')} ·{' '}
							{readiness.objections} {t('object')} · {readiness.total - readiness.answered}{' '}
							{t('not responded')}
						</p>
						<p>
							{t('Required endorsement (%)')}: {latest.threshold} ·{' '}
							{t('All reviewers must respond; no objections may remain.')}
						</p>
						{review && user && latest.reviewerIds.includes(user.uid) && (
							<form
								onSubmit={(event) => {
									event.preventDefault();
									const form = new FormData(event.currentTarget);
									void act({
										type: 'position',
										version: latest.version,
										position: String(form.get('position')) as 'endorse' | 'no-objection' | 'object',
										reason: String(form.get('reason') || ''),
									});
								}}
							>
								<label>
									{t('Your position')}
									<select
										aria-label={t('Your position')}
										name="position"
										key={yourPosition?.position}
										defaultValue={yourPosition?.position || ''}
										required
									>
										<option value="" disabled>
											{t('Choose a position')}
										</option>
										<option value="endorse">{t('I endorse this wording')}</option>
										<option value="no-objection">{t('I do not object')}</option>
										<option value="object">{t('I object')}</option>
									</select>
								</label>
								<label>
									{t('Reason (required for an objection)')}
									<textarea name="reason" defaultValue={yourPosition?.reason} maxLength={1500} />
								</label>
								<button>{t('Record my position')}</button>
							</form>
						)}
						<details>
							<summary>{t('Review responses')}</summary>
							{latest.reviewerIds.map((uid) => (
								<p key={uid}>
									{members.find((m) => m.uid === uid)?.name || uid}:{' '}
									{t(latest.positions[uid]?.position || 'not responded')}{' '}
									{latest.positions[uid]?.reason}
								</p>
							))}
						</details>
						{canManage && (
							<div className={styles.journey__actions}>
								{review && (
									<button
										disabled={!readiness.ready}
										onClick={() => void act({ type: 'adopt', version: latest.version })}
									>
										{t('Record adoption')}
									</button>
								)}
								<button onClick={() => void act({ type: 'reopen' })}>
									{t('Reopen drafting for amendments')}
								</button>
							</div>
						)}
						{record.phase === 'adopted' && (
							<p role="status">{t('Adoption recorded for this exact version.')}</p>
						)}
					</section>
				)}
			</fieldset>
			{record.reviews.length > 0 && (
				<details className={styles.journey__section}>
					<summary>
						{t('Version history')} · {record.reviews.length}
					</summary>
					{record.reviews.map((version) => (
						<section key={version.version} className={styles.journey__card}>
							<h3>
								{t('Version')} {version.version} ·{' '}
								{t(version.adoptedAt ? 'Adopted' : 'Review record')}
							</h3>
							{version.clauses.map((clause) => (
								<p key={clause.id}>{clause.text}</p>
							))}
							<button onClick={() => exportDocument(record, version)}>
								{t('Export this version')}
							</button>
						</section>
					))}
				</details>
			)}
		</section>
	);
}

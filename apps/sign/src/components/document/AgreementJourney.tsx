'use client';
import { useCallback, useEffect, useState } from 'react';
import { requestDeliberation, AGREEMENT_POLL_MS } from '@/lib/firebase/deliberation';
import { logError } from '@/lib/utils/errorHandling';
import { DeliberationStatus, DELIBERATION_LIMITS } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useFirebaseAuth } from '@/hooks/useFirebaseAuth';
import styles from './AgreementJourney.module.scss';
export default function AgreementJourney({
	questionId,
	documentId,
}: {
	questionId: string;
	documentId: string;
}) {
	const { t } = useTranslation();
	const { user } = useFirebaseAuth();
	const [data, setData] = useState<DeliberationStatus>();
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const perform = useCallback(
		async (action: string, extra: Record<string, unknown> = {}) => {
			if (!user) return;
			if (action !== 'status') {
				setBusy(true);
				setError('');
			}
			try {
				setData((await requestDeliberation({ questionId, documentId, action, ...extra })).data);
				setError('');
			} catch (e) {
				logError(e, { operation: 'AgreementJourney', documentId });
				setError(t('Could not complete action.'));
			} finally {
				if (action !== 'status') setBusy(false);
			}
		},
		[user, questionId, documentId, t],
	);
	useEffect(() => {
		void perform('status');
		const timer = setInterval(() => {
			if (!document.hidden) void perform('status');
		}, AGREEMENT_POLL_MS);
		return () => clearInterval(timer);
	}, [perform]);
	const current = data?.agreements.find((a) => a.id === documentId);
	return (
		<section className={styles.journey} aria-label={t('Agreement process')}>
			<h2>{t('One question. Room for different paths.')}</h2>
			<p>
				{t(
					'Improve the wording below. Evaluate this exact document, or propose changes that can become a new version or an alternative.',
				)}
			</p>
			{!user && <p>{t('Sign in and join the question to participate.')}</p>}
			{error && <p role="alert">{error}</p>}
			{current && (
				<>
					<p className={styles.status}>
						{t(current.agreed ? 'Passed the agreement threshold' : 'Draft for review')} · Cp{' '}
						{Math.round(current.cp * 100)}% · {current.evaluators} {t('People evaluated')}
					</p>
					<p>
						{t(
							'70% Cp establishes agreement. Choosing one alternative for implementation is a separate decision.',
						)}
					</p>
					<div className={styles.actions}>
						{(
							[
								['Support this wording', 1],
								['Neutral', 0],
								['Oppose this wording', -1],
							] as const
						).map(([label, value]) => (
							<button
								key={value}
								aria-pressed={current.myRating === value}
								disabled={busy}
								onClick={() => void perform('rate', { hash: current.hash, value })}
							>
								{t(label)}
							</button>
						))}
					</div>
					<small>
						{t(
							'Changes to the document require a fresh evaluation. Earlier responses remain attached to the earlier wording.',
						)}
					</small>
					<details>
						<summary>{t('Propose changes or an alternative')}</summary>
						<form
							onSubmit={(event) => {
								event.preventDefault();
								const form = new FormData(event.currentTarget);
								const changes = current.paragraphs
									.filter((p) => form.get('change-' + p.id) === 'on')
									.map((p) => ({
										paragraphId: p.id,
										text: String(form.get('text-' + p.id) || ''),
									}));
								void perform('propose', {
									hash: current.hash,
									issue: String(form.get('issue') || ''),
									changes,
								});
							}}
						>
							<label>
								{t('What question or disagreement does this address?')}
								<textarea name="issue" required maxLength={DELIBERATION_LIMITS.issueCharacters} />
							</label>
							{current.paragraphs.map((p) => (
								<fieldset key={p.id}>
									<label>
										<input type="checkbox" name={'change-' + p.id} />
										{t('Change this paragraph')}
									</label>
									<textarea name={'text-' + p.id} defaultValue={p.text} maxLength={DELIBERATION_LIMITS.paragraphCharacters} />
								</fieldset>
							))}
							<button disabled={busy}>{t('Submit proposed changes')}</button>
						</form>
					</details>
					{data?.changes
						.filter((c) => c.documentId === documentId)
						.map((c) => (
							<article key={c.id}>
								<h3>{c.issue}</h3>
								{c.changes.map((change) => (
									<p key={change.paragraphId}>{change.text}</p>
								))}
								{c.status === 'applied' ? (
									<a href={`/doc/${c.resultId}`}>{t('Open resulting agreement')} ↗</a>
								) : (
									data.canManage && (
										<form
											onSubmit={(e) => {
												e.preventDefault();
												const form = new FormData(e.currentTarget);
												void perform('fork', {
													hash: current.hash,
													requestId: c.id,
													kind: String(form.get('kind')),
													title: String(form.get('title')),
												});
											}}
										>
											<label>
												{t('Document title')}
												<input name="title" defaultValue={current.title} required maxLength={DELIBERATION_LIMITS.titleCharacters} />
											</label>
											<label>
												{t('How should these changes be developed?')}
												<select name="kind">
													<option value="version">{t('New version')}</option>
													<option value="alternative">{t('Alternative wording')}</option>
												</select>
											</label>
											<button disabled={busy || c.baseHash !== current.hash}>
												{t('Create from these changes')}
											</button>
											{c.baseHash !== current.hash && (
												<p>{t('The source wording changed. Please submit an updated proposal.')}</p>
											)}
										</form>
									)
								)}
							</article>
						))}
					<details>
						<summary>{t('Versions and alternatives')}</summary>
						{data?.agreements
							.filter((a) => a.id !== documentId)
							.map((a) => (
								<p key={a.id}>
									<a href={`/doc/${a.id}`}>{a.title}</a> ·{' '}
									{t(a.kind === 'alternative' ? 'Alternative wording' : 'New version')} · Cp{' '}
									{Math.round(a.cp * 100)}%
								</p>
							))}
					</details>
				</>
			)}
		</section>
	);
}

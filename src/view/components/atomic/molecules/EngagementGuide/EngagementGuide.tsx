import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { X, ArrowUpRight } from 'lucide-react';
import { Statement } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { inAppNotificationsSelector } from '@/redux/notificationsSlice/notificationsSlice';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import { evaluationsSelector } from '@/redux/evaluations/evaluationsSlice';
import { useIsProcessHalted } from '@/controllers/hooks/useIsProcessHalted';
import { relevantNotifications } from '@/utils/engagementNavigation';
import { getEngagementSuggestion } from '@/utils/engagementSuggestion';
import styles from './EngagementGuide.module.scss';

interface Props {
	userId: string;
	statement?: Statement;
	firstSpaceId?: string;
	onCreate: () => void;
}
function GuideFace() {
	return (
		<svg className={styles.guide__face} viewBox="0 0 72 72" aria-hidden="true" focusable="false">
			<path className={styles.guide__antenna} d="M36 15V8m-3 0h6" />
			<rect className={styles.guide__head} x="8" y="16" width="56" height="45" rx="20" />
			<path className={styles.guide__ears} d="M8 32H4v14h4m56-14h4v14h-4" />
			<g className={styles.guide__eyes}>
				<circle cx="25" cy="35" r="4" />
				<circle cx="47" cy="35" r="4" />
			</g>
			<path className={styles.guide__smile} d="M28 46q8 9 16 0" />
		</svg>
	);
}
export default function EngagementGuide({ userId, statement, firstSpaceId, onCreate }: Props) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const storageKey = `wizcol:guide-hidden:${userId}`;
	const [hidden, setHidden] = useState(() => {
		try {
			return localStorage.getItem(storageKey) === 'true';
		} catch {
			return false;
		}
	});
	const returnRef = useRef<HTMLButtonElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const notifications = useAppSelector(inAppNotificationsSelector);
	const selectOptions = useMemo(
		() => statementOptionsSelector(statement?.statementId),
		[statement?.statementId],
	);
	const options = useAppSelector(selectOptions);
	const evaluations = useAppSelector(evaluationsSelector);
	const { isHalted } = useIsProcessHalted(statement);
	const suggestion = getEngagementSuggestion({
		statement,
		unread: relevantNotifications(notifications, userId).filter((n) => !n.read),
		options,
		evaluatedIds: new Set(
			evaluations.filter((e) => e.evaluatorId === userId).map((e) => e.statementId),
		),
		halted: isHalted,
		firstSpaceId,
	});
	const changeVisibility = (next: boolean): void => {
		setHidden(next);
		try {
			localStorage.setItem(storageKey, String(next));
		} catch {
			/* Remain usable when storage is unavailable. */
		}
		requestAnimationFrame(() => (next ? returnRef : closeRef).current?.focus());
	};
	if (hidden)
		return (
			<div className={styles.guide__resting}>
				<button ref={returnRef} type="button" onClick={() => changeVisibility(false)}>
					<GuideFace />
					{t('Show guide')}
				</button>
			</div>
		);

	return (
		<section className={styles.guide} aria-label={t('Your little guide')}>
			<GuideFace />
			<div className={styles.guide__content}>
				<span className={styles.guide__eyebrow}>{t('A SMALL STEP, TOGETHER')}</span>
				<h2>{t(suggestion.title)}</h2>
				<p>{t(suggestion.body).replace('{{count}}', String(suggestion.count ?? 0))}</p>
				<button
					className={styles.guide__action}
					type="button"
					onClick={() => (suggestion.to ? navigate(suggestion.to) : onCreate())}
				>
					{t(suggestion.action)}
					<ArrowUpRight size={17} />
				</button>
			</div>
			<button
				ref={closeRef}
				className={styles.guide__close}
				type="button"
				onClick={() => changeVisibility(true)}
				aria-label={t('Hide guide')}
				title={t('Hide guide')}
			>
				<X size={18} />
			</button>
		</section>
	);
}

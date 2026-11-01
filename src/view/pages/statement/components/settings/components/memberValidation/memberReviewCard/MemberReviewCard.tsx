import React, { FC, useId, useState, memo } from 'react';
import { Statement, Role } from '@freedi/shared-types';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import type { MemberReviewData } from '@/types/demographics';
import styles from './MemberReviewCard.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getBanDisabledReason } from '@/helpers/roleHelpers';

interface Props {
	member: MemberReviewData;
	statement: Statement;
	isSelected: boolean;
	onSelect: (userId: string, selected: boolean) => void;
	onApprove: () => void;
	onFlag: () => void;
	onBan: () => void;
	canBan: boolean;
}

const MemberReviewCard: FC<Props> = ({
	member,
	statement,
	isSelected,
	onSelect,
	onApprove,
	onFlag,
	onBan,
	canBan,
}) => {
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState(false);
	const contentId = useId();

	const getRoleBadge = () => {
		if (member.role === Role.admin) {
			return <span className={`${styles.badge} ${styles.admin}`}>{t('people.role.host')}</span>;
		}
		if (member.role === Role.creator || statement.creator?.uid === member.userId) {
			return <span className={`${styles.badge} ${styles.creator}`}>{t('Creator')}</span>;
		}

		return null;
	};

	const getStatusBadge = () => {
		switch (member.status) {
			case 'approved':
				return (
					<span className={`${styles.badge} ${styles.approved}`}>
						✓ {t('people.entry.approved')}
					</span>
				);
			case 'flagged':
				return (
					<span className={`${styles.badge} ${styles.flagged}`}>
						⚠ {t('people.entry.flagged')}
					</span>
				);
			case 'banned':
				return (
					<span className={`${styles.badge} ${styles.banned}`}>🚫 {t('people.entry.blocked')}</span>
				);
			default:
				return (
					<span className={`${styles.badge} ${styles.pending}`}>
						⏳ {t('people.entry.waitingReview')}
					</span>
				);
		}
	};

	const detectSuspiciousPatterns = () => {
		const flags: string[] = [];

		// Check for very short answers
		const shortAnswers = member.responses.filter(
			(r) => typeof r.answer === 'string' && r.answer.length < 3,
		);
		if (shortAnswers.length > 0) {
			flags.push(t('Very short answers'));
		}

		// Check for all identical answers
		const answers = member.responses.map((r) => r.answer);
		const uniqueAnswers = new Set(
			answers.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))),
		);
		if (uniqueAnswers.size === 1 && member.responses.length > 1) {
			flags.push(t('Identical answers'));
		}

		// Check for missing required fields
		const emptyAnswers = member.responses.filter(
			(r) => !r.answer || (typeof r.answer === 'string' && r.answer.trim() === ''),
		);
		if (emptyAnswers.length > 0) {
			flags.push(t('Missing answers'));
		}

		return flags;
	};

	const suspiciousFlags = detectSuspiciousPatterns();

	// Generate a brief identifier from user responses
	const getUserIdentifier = () => {
		// If user has a display name that's not "Anonymous", prefer to use it
		if (
			member.user?.displayName &&
			member.user.displayName !== 'Anonymous' &&
			member.user.displayName !== 'Guest'
		) {
			return member.user.displayName;
		}

		// Otherwise, create an identifier from their responses
		const meaningfulAnswers: string[] = [];

		// Collect up to 2 meaningful responses
		for (const response of member.responses) {
			if (meaningfulAnswers.length >= 2) break;

			if (typeof response.answer === 'string' && response.answer.trim().length > 0) {
				// Truncate long answers
				const truncated =
					response.answer.length > 40 ? response.answer.substring(0, 40) + '...' : response.answer;
				meaningfulAnswers.push(truncated);
			} else if (Array.isArray(response.answer) && response.answer.length > 0) {
				// For checkbox responses, show selections
				const selections = response.answer.slice(0, 3).join(', ');
				const truncated = selections.length > 40 ? selections.substring(0, 40) + '...' : selections;
				meaningfulAnswers.push(truncated);
			}
		}

		// If we have meaningful answers, join them
		if (meaningfulAnswers.length > 0) {
			return meaningfulAnswers.join(' | ');
		}

		// Fallback: if no meaningful responses, show "No responses provided"
		return t('No responses provided');
	};

	const userIdentifier = getUserIdentifier();

	return (
		<div className={`${styles.memberCard} ${member.status === 'banned' ? styles.banned : ''}`}>
			<div className={styles.header}>
				<div className={styles.selectionAndInfo}>
					<input
						type="checkbox"
						aria-label={fillPlaceholders(t('people.selectPerson'), { name: userIdentifier })}
						checked={isSelected}
						onChange={(e) => onSelect(member.userId, e.target.checked)}
						disabled={member.status === 'banned' || !canBan}
						title={!canBan ? getBanDisabledReason(member.role, member.userId, statement) || '' : ''}
					/>
					<div className={styles.userInfo}>
						<div className={styles.nameRow}>
							<h4>{userIdentifier}</h4>
							{getRoleBadge()}
							{getStatusBadge()}
						</div>
						{member.user.email && <span className={styles.email}>{member.user.email}</span>}
						{member.joinedAt && (
							<span className={styles.joinDate}>
								{t('Joined')}: {new Date(member.joinedAt).toLocaleDateString()}
							</span>
						)}
					</div>
				</div>

				{suspiciousFlags.length > 0 && (
					<div className={styles.warnings}>
						{suspiciousFlags.map((flag, idx) => (
							<span key={idx} className={styles.warningBadge}>
								⚠️ {flag}
							</span>
						))}
					</div>
				)}

				<button
					type="button"
					className={styles.expandBtn}
					onClick={() => setExpanded(!expanded)}
					aria-expanded={expanded}
					aria-controls={contentId}
					aria-label={fillPlaceholders(t('people.entry.answersOf'), { name: userIdentifier })}
				>
					{expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
				</button>
			</div>

			{expanded && (
				<div id={contentId} className={styles.content}>
					<div className={styles.responses}>
						<h5>{t('Survey Responses')}:</h5>
						{member.responses.map((response, idx) => (
							<div key={idx} className={styles.response}>
								<div className={styles.question}>{response.question}</div>
								<div className={styles.answer}>
									{Array.isArray(response.answer)
										? response.answer.join(', ')
										: response.answer || t('No answer')}
								</div>
							</div>
						))}
					</div>

					{member.status !== 'banned' && (
						<div className={styles.actions}>
							{member.status !== 'approved' && (
								<button className="btn btn--small btn--primary" onClick={onApprove}>
									✓ {t('Approve')}
								</button>
							)}
							{member.status !== 'flagged' && (
								<button className="btn btn--small btn--secondary" onClick={onFlag}>
									🔍 {t('Flag for Review')}
								</button>
							)}
							<button
								className="btn btn--small btn--error"
								onClick={onBan}
								disabled={!canBan}
								title={
									!canBan ? getBanDisabledReason(member.role, member.userId, statement) || '' : ''
								}
							>
								🚫 {t('Remove/Ban')}
							</button>
							{!canBan && (
								<div className={styles.protectedNotice}>
									{getBanDisabledReason(member.role, member.userId, statement)}
								</div>
							)}
						</div>
					)}

					{member.status === 'banned' && (
						<div className={styles.bannedNotice}>
							{t('This member has been banned from this discussion')}
							<br />
							<small>{t('Note: Their votes have been removed')}</small>
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default memo(MemberReviewCard);

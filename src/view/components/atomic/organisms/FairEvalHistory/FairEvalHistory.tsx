import React, { useMemo } from 'react';
import clsx from 'clsx';
import { History, UserPlus, Plus, CreditCard, RefreshCw, Loader, Clock } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { FairEvalTransaction, FairEvalTransactionType } from '@freedi/shared-types';

/**
 * FairEvalHistory Organism - Atomic Design System
 *
 * Transaction history timeline for fair evaluation wallet.
 * Shows grouped transactions by date with color-coded event types.
 * All styling is handled by SCSS in src/view/style/organisms/_fair-eval-history.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FairEvalHistoryProps {
	/** List of transactions */
	transactions: FairEvalTransaction[];

	/** Current wallet balance */
	balance: number;

	/** Loading state */
	loading?: boolean;

	/** Additional CSS classes */
	className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get icon for transaction type
 */
function getTransactionIcon(type: FairEvalTransactionType): React.ReactNode {
	switch (type) {
		case 'join':
			return <UserPlus />;
		case 'admin_add':
			return <Plus />;
		case 'payment':
			return <CreditCard />;
		case 'refund':
			return <RefreshCw />;
		default:
			return <Clock />;
	}
}

/**
 * Format date for display
 */
function formatDate(timestamp: number): string {
	const date = new Date(timestamp);
	const now = new Date();
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);

	if (date.toDateString() === now.toDateString()) {
		return 'Today';
	}
	if (date.toDateString() === yesterday.toDateString()) {
		return 'Yesterday';
	}

	return date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
	});
}

/**
 * Format time for display
 */
function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
	});
}

/**
 * Group transactions by date
 */
function groupByDate(transactions: FairEvalTransaction[]): Map<string, FairEvalTransaction[]> {
	const groups = new Map<string, FairEvalTransaction[]>();

	// Sort by date descending
	const sorted = [...transactions].sort((a, b) => b.createdAt - a.createdAt);

	for (const tx of sorted) {
		const dateKey = new Date(tx.createdAt).toDateString();
		const existing = groups.get(dateKey) || [];
		groups.set(dateKey, [...existing, tx]);
	}

	return groups;
}

// ============================================================================
// COMPONENT
// ============================================================================

const FairEvalHistory: React.FC<FairEvalHistoryProps> = ({
	transactions,
	balance,
	loading = false,
	className,
}) => {
	const { t } = useTranslation();

	// Group transactions by date
	const groupedTransactions = useMemo(
		() => groupByDate(transactions),
		[transactions]
	);

	// Determine balance status
	const balanceStatus = balance > 10 ? 'high' : balance > 0 ? 'medium' : 'low';

	// Build classes
	const classes = clsx(
		'fair-eval-history',
		loading && 'fair-eval-history--loading',
		className
	);

	// Get transaction title
	const getTransactionTitle = (type: FairEvalTransactionType): string => {
		switch (type) {
			case 'join':
				return t('Joined Group');
			case 'admin_add':
				return t('Admin Added Minutes');
			case 'payment':
				return t('Payment for Answer');
			case 'refund':
				return t('Refund');
			default:
				return t('Transaction');
		}
	};

	return (
		<div className={classes}>
			{/* Header */}
			<div className="fair-eval-history__header">
				<h3 className="fair-eval-history__title">
					<History />
					{t('Transaction History')}
				</h3>
				<div className="fair-eval-history__balance">
					<span>{t('Balance')}:</span>
					<span className={`fair-eval-history__balance-value fair-eval-history__balance-value--${balanceStatus}`}>
						{Math.round(balance * 10) / 10} {t('min')}
					</span>
				</div>
			</div>

			{/* Loading State */}
			{loading && (
				<div className="fair-eval-history__loading">
					<Loader size={24} />
				</div>
			)}

			{/* Empty State */}
			{!loading && transactions.length === 0 && (
				<div className="fair-eval-history__empty">
					<div className="fair-eval-history__empty-icon">
						<History />
					</div>
					<h4 className="fair-eval-history__empty-title">
						{t('No Transactions Yet')}
					</h4>
					<p className="fair-eval-history__empty-description">
						{t('Your transaction history will appear here')}
					</p>
				</div>
			)}

			{/* Transaction Groups */}
			{!loading && Array.from(groupedTransactions.entries()).map(([dateKey, txs]) => (
				<div key={dateKey} className="fair-eval-history__date-group">
					<div className="fair-eval-history__date-header">
						{formatDate(txs[0].createdAt)}
					</div>
					{txs.map((tx) => (
						<div
							key={tx.transactionId}
							className={`fair-eval-history__item fair-eval-history__item--${tx.type}`}
						>
							<div className={`fair-eval-history__item-icon fair-eval-history__item-icon--${tx.type}`}>
								{getTransactionIcon(tx.type)}
							</div>
							<div className="fair-eval-history__item-content">
								<div className="fair-eval-history__item-title">
									{getTransactionTitle(tx.type)}
								</div>
								{tx.answerTitle && (
									<div className="fair-eval-history__item-description">
										{tx.answerTitle}
									</div>
								)}
								<div className="fair-eval-history__item-time">
									{formatTime(tx.createdAt)}
								</div>
							</div>
							<div
								className={clsx(
									'fair-eval-history__item-amount',
									tx.amount >= 0
										? 'fair-eval-history__item-amount--positive'
										: 'fair-eval-history__item-amount--negative'
								)}
							>
								{Math.round(Math.abs(tx.amount) * 10) / 10} {t('min')}
							</div>
						</div>
					))}
				</div>
			))}
		</div>
	);
};

export default FairEvalHistory;

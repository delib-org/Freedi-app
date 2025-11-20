import React from 'react';
import Card from '@/view/components/atomic/molecules/Card/Card';
import { Button } from '@/view/components/atomic/atoms/Button';

/**
 * AllOptionsEvaluated - Completion Message Component
 *
 * Displays a success message when user has evaluated all available options.
 * Uses atomic design system - Card molecule + Button atom
 */

export interface AllOptionsEvaluatedProps {
	/** Optional callback for "View Results" action */
	onViewResults?: () => void;

	/** Custom message (optional) */
	message?: string;

	/** Additional CSS classes */
	className?: string;
}

const AllOptionsEvaluated: React.FC<AllOptionsEvaluatedProps> = ({
	onViewResults,
	message,
	className,
}) => {
	const defaultMessage = message || 'Thank you! You have evaluated all available options.';

	return (
		<Card
			variant="success"
			centered
			spacious
			className={className}
			title="All Options Evaluated! 🎉"
			footer={
				onViewResults && (
					<Button
						text="View Results"
						variant="primary"
						onClick={onViewResults}
					/>
				)
			}
		>
			<p>{defaultMessage}</p>
		</Card>
	);
};

export default AllOptionsEvaluated;

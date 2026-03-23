import { FC, useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface StatementBriefProps {
	brief: string;
	className?: string;
}

const StatementDescription: FC<StatementBriefProps> = ({
	brief,
	className,
}) => {
	const { t } = useTranslation();
	const [isExpanded, setIsExpanded] = useState(false);
	const [isClamped, setIsClamped] = useState(false);
	const contentRef = useRef<HTMLParagraphElement>(null);

	useEffect(() => {
		const el = contentRef.current;
		if (el) {
			setIsClamped(el.scrollHeight > el.clientHeight);
		}
	}, [brief]);

	return (
		<div
			className={clsx('statement-description', className)}
			role="note"
			aria-label={t('Facilitator context')}
		>
			<span className="statement-description__label">
				{t('Context')}
			</span>
			<p
				ref={contentRef}
				className={clsx(
					'statement-description__content',
					!isExpanded && 'statement-description__content--collapsed',
				)}
			>
				{brief}
			</p>
			{isClamped && (
				<button
					className="statement-description__toggle"
					onClick={() => setIsExpanded((prev) => !prev)}
					aria-expanded={isExpanded}
				>
					{isExpanded ? t('Show less') : t('Read more')}
				</button>
			)}
		</div>
	);
};

export default StatementDescription;

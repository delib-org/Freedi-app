import React from 'react';
import clsx from 'clsx';

export interface QuestionCardGridProps {
	className?: string;
	children: React.ReactNode;
}

const QuestionCardGrid: React.FC<QuestionCardGridProps> = ({ className, children }) => (
	<div className={clsx('question-card-grid', className)}>{children}</div>
);

export default QuestionCardGrid;

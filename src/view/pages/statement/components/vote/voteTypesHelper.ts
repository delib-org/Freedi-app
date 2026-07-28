import { Statement } from '@freedi/shared-types';
import React from 'react';

export interface OptionsBarsProps {
	setStatementInfo: React.Dispatch<React.SetStateAction<Statement | null>>;
	statement: Statement;
	setShowInfo: React.Dispatch<React.SetStateAction<boolean>>;
	totalVotes: number;
	options: Statement[];
	optionsCount: number;
}

export interface OptionBarProps {
	option: Statement;
	/** Vote count for this option, already adjusted for an unconfirmed vote. */
	selections: number;
	/** Whether the user's vote currently sits on this option. */
	isSelected: boolean;
	castVote: (option: Statement) => Promise<void>;
	totalVotes: number;
	order: number;
	setStatementInfo: React.Dispatch<React.SetStateAction<Statement | undefined>>;
	setShowInfo: React.Dispatch<React.SetStateAction<boolean>>;
	optionsCount: number;
	isVertical: boolean;
	screenWidth: number;
}

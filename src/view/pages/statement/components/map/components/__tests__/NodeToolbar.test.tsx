import React from 'react';
import { render, screen } from '@testing-library/react';
import { StatementType } from '@freedi/shared-types';
import NodeToolbar from '../NodeToolbar';
import { canDeleteNode, canEditNode } from '../../mapHelpers/nodeMenuLabels';
import type { TypeChoice } from '../../mapHelpers/statementTypeChoices';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => `t:${key}` }),
}));
jest.mock('@/controllers/db/statements/setStatements', () => ({ saveStatementToDB: jest.fn() }));
jest.mock('@/controllers/db/statements/updateStatementFields', () => ({
	updateStatementText: jest.fn(),
}));
jest.mock('@/redux/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/redux/statements/statementsSlice', () => ({ setStatement: jest.fn() }));

const choices: TypeChoice[] = [
	{
		type: StatementType.question,
		labelKey: 'x',
		isCurrent: false,
		allowed: true,
	},
];

interface Viewer {
	isAdmin: boolean;
	isAuthor: boolean;
}

function renderFor({ isAdmin, isAuthor }: Viewer): void {
	const onNoop = jest.fn();
	render(
		<NodeToolbar
			anchorTop={200}
			anchorBottom={240}
			anchorLeft={300}
			onOpen={onNoop}
			onEdit={canEditNode({ isAdmin, isAuthor }) ? onNoop : undefined}
			onDelete={
				canDeleteNode({
					isAdmin,
					isAuthor,
					isRoot: false,
					statementType: StatementType.option,
				})
					? onNoop
					: undefined
			}
			typeChoices={isAdmin ? choices : undefined}
			onChangeType={isAdmin ? onNoop : undefined}
		/>,
	);
}

describe('NodeToolbar', () => {
	it('admin sees every named action', () => {
		renderFor({ isAdmin: true, isAuthor: false });

		expect(screen.getByText('t:map.node.open')).toBeTruthy();
		expect(screen.getByText('t:Edit')).toBeTruthy();
		expect(screen.getByText('t:Change type')).toBeTruthy();
		expect(screen.getByText('t:Delete')).toBeTruthy();
	});

	it('author sees Open, Edit and Delete but not Change type', () => {
		renderFor({ isAdmin: false, isAuthor: true });

		expect(screen.getByText('t:map.node.open')).toBeTruthy();
		expect(screen.getByText('t:Edit')).toBeTruthy();
		expect(screen.getByText('t:Delete')).toBeTruthy();
		expect(screen.queryByText('t:Change type')).toBeNull();
	});

	it('another viewer sees only Open', () => {
		renderFor({ isAdmin: false, isAuthor: false });

		expect(screen.getByText('t:map.node.open')).toBeTruthy();
		expect(screen.queryByText('t:Edit')).toBeNull();
		expect(screen.queryByText('t:Delete')).toBeNull();
		expect(screen.queryByText('t:Change type')).toBeNull();
	});

	it('shows the rating heading above the faces', () => {
		render(
			<NodeToolbar
				anchorTop={200}
				anchorBottom={240}
				anchorLeft={300}
				onOpen={jest.fn()}
				rating={{
					faces: [{ value: 1, labelKey: 'Agree', emoji: 'x', color: 'a', colorSelected: 'b' }],
					activeValue: undefined,
					readOnly: true,
					onRate: jest.fn(),
				}}
			/>,
		);

		expect(screen.getByText('t:Counted into the merged idea')).toBeTruthy();
		expect((screen.getByLabelText('t:Agree') as HTMLButtonElement).disabled).toBe(true);
	});
});

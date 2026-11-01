import * as fs from 'node:fs';
import * as path from 'node:path';
import { screen } from '@testing-library/react';
import { Statement, StatementType } from '@freedi/shared-types';
import { renderWithProviders } from '@/test-utils/test-utils';
import PeopleSection from '../PeopleSection';
import { FORM_COMPOSITION } from '../../settings/components/statementSettingsForm/StatementSettingsForm';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k, dir: 'ltr' }),
}));

function mockStub(testId: string) {
	return {
		__esModule: true,
		default: () => <div data-testid={testId} />,
	};
}

jest.mock('../../settings/components/membershipSettings/MembershipSettings', () =>
	mockStub('membership'),
);
jest.mock('../../settings/components/membership/MembersSettings', () => mockStub('members'));
jest.mock('../../settings/components/membership/AdminsManagement/AdminsManagement', () =>
	mockStub('admins'),
);
jest.mock('../../settings/components/memberValidation/MemberValidation', () =>
	mockStub('validation'),
);
jest.mock('../../settings/components/UserDemographicSettings/UserDemographicSetting', () =>
	mockStub('demographics'),
);
jest.mock('../../settings/components/membership/MembersManagement', () =>
	mockStub('members-management'),
);
jest.mock('../../settings/components/optionRooms', () => ({
	OptionRooms: () => <div data-testid="rooms" />,
}));
jest.mock('../../settings/components/QuestionSettings/ConfidenceIndexSettings', () =>
	mockStub('stakeholders-setting'),
);

function makeStatement(statementType: StatementType): Statement {
	return {
		statementId: 's1',
		topParentId: 's1',
		parentId: 'top',
		statement: 'S',
		statementType,
		creator: { uid: 'u', displayName: 'U' },
		creatorId: 'u',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
	} as Statement;
}

describe('PeopleSection stakeholders', () => {
	it.each([StatementType.question, StatementType.group])(
		'renders the stakeholder count once for a %s',
		(type) => {
			renderWithProviders(
				<PeopleSection statement={makeStatement(type)} setStatementToEdit={jest.fn()} />,
			);

			expect(screen.getAllByTestId('stakeholders-setting')).toHaveLength(1);
			expect(screen.getByText('host.people.stakeholders')).toBeTruthy();
		},
	);

	it('Results & Decision group no longer composes it, and the hub list does not either', () => {
		const source = fs.readFileSync(
			path.resolve(
				__dirname,
				'../../settings/components/statementSettingsForm/StatementSettingsForm.tsx',
			),
			'utf8',
		);
		const start = source.indexOf("t('Results & Decision')");
		const end = source.indexOf("t('AI & Smart Features')");
		const resultsGroup = source.slice(start, end);

		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		expect(resultsGroup).not.toContain('ConfidenceIndexSettings');
		expect(source.match(/<ConfidenceIndexSettings /g)).toHaveLength(1);
		expect(FORM_COMPOSITION.hub.map((e) => e.component)).not.toContain('ConfidenceIndexSettings');
	});
});

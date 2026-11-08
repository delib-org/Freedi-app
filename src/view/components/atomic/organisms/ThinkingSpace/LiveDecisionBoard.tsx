import React from 'react';
import { Statement } from '@freedi/shared-types';
import AgreementHub from './AgreementHub';

export default function LiveDecisionBoard({ statement }: { statement: Statement }) {
	return <AgreementHub key={statement.statementId} statement={statement} compact />;
}

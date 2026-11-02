import { FC, Ref } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import PeopleSubsection from '@/view/components/atomic/molecules/PeopleSubsection';
import { OptionRooms } from '../../settings/components/optionRooms';

interface JoiningSubsectionProps {
	statement: Statement;
	/** "On" / "Off" — whether people can join answers. */
	summary: string;
	isOpen: boolean;
	onToggle: (anchor: string) => void;
	toggleRef: Ref<HTMLButtonElement>;
}

/**
 * Joining answers & rooms (#joining, questions only): the master switch,
 * one/many, join form, conditional joining, activation threshold and the
 * rooms — one block (IA defect 5). The controls are OptionRooms.
 */
const JoiningSubsection: FC<JoiningSubsectionProps> = ({ statement, summary, ...accordion }) => {
	const { t } = useTranslation();

	return (
		<PeopleSubsection
			id="joining"
			title={t('people.joiningAndRooms')}
			summary={summary}
			{...accordion}
		>
			<OptionRooms statement={statement} />
		</PeopleSubsection>
	);
};

export default JoiningSubsection;

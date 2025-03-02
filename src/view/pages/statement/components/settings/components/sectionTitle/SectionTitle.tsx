import { FC } from 'react';
import LightCogIcon from '@/assets/icons/lightCogIcon.svg?react';
import './SectionTitle.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface SectionTitleProps {
	title: string;
}

const SectionTitle: FC<SectionTitleProps> = ({ title }) => {
	const { dir } = useUserConfig();

	return (
		<h2 className={`section-title ${dir}`}>
			{title} <LightCogIcon />
		</h2>
	);
};

export default SectionTitle;

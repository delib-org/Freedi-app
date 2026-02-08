import { Statement } from '@freedi/shared-types';
import Chat from '@/assets/icons/chatTop.svg?react';

interface NavigationButtonsProps {
	statement?: Statement;
	parentStatement?: Statement;
	handleNavigation: (path: string, screen?: string) => void;
	headerStyle: { color: string; backgroundColor: string };
}

function NavigationButtons({
	handleNavigation,
	headerStyle,
	statement,
}: Readonly<NavigationButtonsProps>) {
	const { hasChat } = statement?.statementSettings || { hasChat: false };

	if (!hasChat) return null;

	return (
		<button onClick={() => handleNavigation('chat', "screen")} >
			<Chat color={headerStyle.color} />
		</button>
	);
}
export default NavigationButtons;
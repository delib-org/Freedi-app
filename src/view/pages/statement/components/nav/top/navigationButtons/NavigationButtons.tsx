import { Statement } from "@/types/statement/StatementTypes";
import Chat from '@/assets/icons/chatTop.svg?react';

interface NavigationButtonsProps {
	statement?: Statement;
	parentStatement?: Statement;
	handleNavigation: (path: string) => void;
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
		<button onClick={() => handleNavigation('chat')}>
			<Chat color={headerStyle.color} />
		</button>
	);
}
export default NavigationButtons;
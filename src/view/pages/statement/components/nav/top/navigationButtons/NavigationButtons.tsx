import { Statement } from "@/types/statement/StatementTypes";
import Chat from '@/assets/icons/chatTop.svg?react';
import MainIcon from '@/assets/icons/evaluations2Icon.svg?react';

interface NavigationButtonsProps {
	statement?: Statement;
	parentStatement?: Statement;
	screen: string | undefined;
	handleNavigation: (path: string) => void;
	headerStyle: { color: string; backgroundColor: string };
}

function NavigationButtons({
	screen,
	handleNavigation,
	headerStyle,
	statement,
}: Readonly<NavigationButtonsProps>) {
	const { hasChat } = statement?.statementSettings || { hasChat: false };
	if (!hasChat) return null;

	return (
		<>
			{(() => {
				switch (screen) {
					case 'main':
						return (
							<button onClick={() => handleNavigation('chat')}>
								<Chat color={headerStyle.color} />
							</button>
						);
					case 'chat':
					case 'settings':
					default:
						return (
							<button onClick={() => handleNavigation('main')}>
								<MainIcon color={headerStyle.color} />
							</button>
						);
				}
			})()}
		</>
	);
}
export default NavigationButtons;
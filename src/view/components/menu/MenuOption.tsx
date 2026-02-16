import { ComponentProps, FC, ReactNode } from 'react';
import styles from './MenuOption.module.scss';

interface MenuOptionProps extends ComponentProps<'button'> {
	onOptionClick: () => void;
	label: string;
	isOptionSelected?: boolean;
	icon: ReactNode;
	children?: ReactNode;
}

const MenuOption: FC<MenuOptionProps> = ({
	onOptionClick,
	label,
	isOptionSelected = false,
	icon,
	className,
	style,
	children,
}) => {
	return (
		<button
			className={[
				styles.menuOption,
				isOptionSelected ? styles.selected : '',
				className || '', // ✅ forward className
			].join(' ')}
			style={style}
			onClick={onOptionClick}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					onOptionClick();
				}
			}}
		>
			{icon}
			<div className={styles.label} style={style}>
				{label}
			</div>
			{children}
		</button>
	);
};

export default MenuOption;

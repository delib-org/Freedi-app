import { ComponentProps, forwardRef } from 'react';
import styles from './IconButton.module.scss';

const IconButton = forwardRef<HTMLButtonElement, ComponentProps<'button'>>(
	(
		{
			className = 'action-btn',

			...props
		},
		ref,
	) => {
		return (
			<button
				ref={ref}
				className={`${styles.iconButton} ${className}`}
				aria-label="Icon button"
				{...props}
			/>
		);
	},
);

IconButton.displayName = 'IconButton';

export default IconButton;

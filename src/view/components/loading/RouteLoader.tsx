import React from 'react';
import styles from './RouteLoader.module.scss';

const RouteLoader: React.FC = () => {
	return (
		<div className={styles['route-loader']}>
			<div className={styles['route-loader__spinner']}>
				<div className={styles['route-loader__spinner-circle']}></div>
			</div>
			<div className={styles['route-loader__text']}>Loading...</div>
		</div>
	);
};

export default RouteLoader;

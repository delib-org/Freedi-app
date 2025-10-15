import React from 'react';
import './RouteLoader.scss';

const RouteLoader: React.FC = () => {
	return (
		<div className="route-loader">
			<div className="route-loader__spinner">
				<div className="route-loader__spinner-circle"></div>
			</div>
			<div className="route-loader__text">Loading...</div>
		</div>
	);
};

export default RouteLoader;
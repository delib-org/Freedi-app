import { useState, useEffect, useRef } from 'react';

export const useResponsiveDimensions = () => {
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const containerRef = useRef<HTMLDivElement>(null);

	// Handle responsive canvas sizing
	useEffect(() => {
		const updateDimensions = () => {
			if (containerRef.current) {
				const container = containerRef.current;
				const rect = container.getBoundingClientRect();
				const isMobile = window.innerWidth <= 768;
				setDimensions({
					width: rect.width,
					height: Math.min(rect.width * (isMobile ? 1.0 : 0.8), isMobile ? 400 : 500),
				});
			}
		};

		updateDimensions();
		window.addEventListener('resize', updateDimensions);

		return () => window.removeEventListener('resize', updateDimensions);
	}, []);

	return { dimensions, containerRef };
};

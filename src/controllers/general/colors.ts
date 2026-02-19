export const getRandomColor = () => {
	const letters = '0123456789ABCDEF';
	let color = '#';
	for (let i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}

	return color;
};

export function generateRandomLightColor(uuid: string) {
	// Generate a random number based on the UUID
	const seed = parseInt(uuid.replace(/[^\d]/g, ''), 10);
	const randomValue = (seed * 9301 + 49297) % 233280;

	// Convert the random number to a hexadecimal color code
	const hexColor = `#${((randomValue & 0x00ffffff) | 0xc0c0c0).toString(16).toUpperCase()}`;

	return hexColor;
}

export function getPastelColor() {
	return `hsl(${360 * Math.random()},100%,75%)`;
}

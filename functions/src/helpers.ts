export function logBase(x: number, b: number) {
	return Math.log(x) / Math.log(b);
}

//get top selections from selections
export function getTopSelectionKeys(
	selections: { [key: string]: number },
	limit = 1,
): string[] {
	const sortedSelections = Object.entries(selections)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit);

	return sortedSelections.map(([key]) => key);
}

export const isEqualObjects = (objA: object | undefined, objB: object | undefined) => {
	return JSON.stringify(objA) === JSON.stringify(objB);
}

export function getRandomColor() {
	//let them be dark colors
	const letters = '0123456789ABCDEF';
	let color = '#';
	for (let i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}

	return color;
}
/**
 * Manual mock for clsx
 */

const clsx = (...args: unknown[]) => {
	return args
		.flat()
		.filter((arg) => arg && typeof arg === 'string')
		.join(' ');
};

export default clsx;
export { clsx };

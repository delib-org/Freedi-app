declare module 'franc-min' {
	interface Options {
		minLength?: number;
		only?: string[];
		ignore?: string[];
	}
	interface FrancFn {
		(value: string, options?: Options): string;
		all(value: string, options?: Options): Array<[string, number]>;
	}
	const franc: FrancFn;
	export default franc;
}

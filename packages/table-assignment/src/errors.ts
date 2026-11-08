export class TableAssignmentError extends Error {
	constructor(
		message: string,
		public readonly context: Readonly<Record<string, unknown>> = {},
	) {
		super(message);
		this.name = 'TableAssignmentError';
	}
}

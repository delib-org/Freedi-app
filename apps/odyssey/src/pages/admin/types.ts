/** Shared callbacks the Admin shell hands every tab. */
export type Flash = (message: string) => void;

export type Run = (action: () => Promise<void>) => Promise<void>;

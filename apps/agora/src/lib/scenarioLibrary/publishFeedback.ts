/**
 * What the publish sheet tells the teacher: why the button is waiting, and what
 * went wrong when the server said no. Pure, so the words can be tested.
 */

export interface PublishBusy {
	submitting: boolean;
	uploading: boolean;
	drawing: boolean;
}

/** The reason the Publish button is waiting, as a string key, or null when it is free */
export function publishWaitKey(busy: PublishBusy): string | null {
	if (busy.submitting) return 'scenlib.pub_working';
	if (busy.drawing) return 'scenlib.pub_wait_cover';
	if (busy.uploading) return 'scenlib.pub_wait_upload';

	return null;
}

/** The firebase callable error code, if the thrown thing carries one */
export function errorCodeOf(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const code = (error as { code?: unknown }).code;

	return typeof code === 'string' ? code : undefined;
}

/** The message for a failed publish, chosen by the callable's error code */
export function publishErrorKey(code: string | undefined): string {
	switch (code) {
		case 'functions/permission-denied':
			return 'scenlib.pub_err_denied';
		case 'functions/unauthenticated':
			return 'scenlib.pub_err_signin';
		case 'functions/unavailable':
		case 'functions/deadline-exceeded':
			return 'scenlib.pub_err_network';
		case 'functions/internal':
		case 'functions/unknown':
			return 'scenlib.pub_err_server';
		default:
			return 'scenlib.pub_failed';
	}
}

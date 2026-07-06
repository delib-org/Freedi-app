import { useState } from 'react';
import { createEvent } from '@freedi/event-core';
import { db } from '@/firebase';
import { useAuth } from '@/auth/AuthContext';
import styles from './NewEventModal.module.css';

interface NewEventModalProps {
	onClose: () => void;
	onCreated: (eventId: string) => void;
}

export default function NewEventModal({ onClose, onCreated }: NewEventModalProps) {
	const { user } = useAuth();
	const [title, setTitle] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const canSubmit = title.trim().length > 0 && !submitting;

	const handleCreate = async () => {
		if (!user || !canSubmit) return;
		setSubmitting(true);
		setError('');
		try {
			const event = await createEvent(db, {
				title,
				user: {
					uid: user.uid,
					displayName: user.displayName,
					email: user.email,
					photoURL: user.photoURL,
				},
			});
			onCreated(event.statementId);
		} catch (err) {
			const e = err as { code?: string; message?: string };
			console.error('[Studio] createEvent failed', e?.code, e?.message, err);
			setError(
				e?.code || e?.message
					? `Could not create the event: ${e.code ?? ''} ${e.message ?? ''}`.trim()
					: 'Could not create the event. Please try again.',
			);
			setSubmitting(false);
		}
	};

	return (
		<div
			className={styles.scrim}
			role="dialog"
			aria-modal="true"
			aria-label="New event"
			onClick={(e) => {
				if (e.target === e.currentTarget && !submitting) onClose();
			}}
		>
			<div className={styles.modal}>
				<h2 className={styles.title}>New Event</h2>
				<label className={styles.label} htmlFor="event-title">
					Event name
				</label>
				<input
					id="event-title"
					className={styles.input}
					type="text"
					value={title}
					autoFocus
					placeholder="e.g. Climate Town Hall — Haifa"
					onChange={(e) => setTitle(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') handleCreate();
					}}
				/>
				{error && <p className={styles.error}>{error}</p>}
				<div className={styles.actions}>
					<button
						type="button"
						className={styles.cancel}
						onClick={onClose}
						disabled={submitting}
					>
						Cancel
					</button>
					<button
						type="button"
						className={styles.create}
						onClick={handleCreate}
						disabled={!canSubmit}
					>
						{submitting ? 'Creating…' : 'Create event'}
					</button>
				</div>
			</div>
		</div>
	);
}

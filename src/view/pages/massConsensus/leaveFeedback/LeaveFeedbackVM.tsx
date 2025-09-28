import React, { useState } from "react";
import firebaseConfig from '@/controllers/db/configKey';
import { functionConfig, Feedback } from "delib-npm";
import { useParams } from "react-router";
import { useAuthentication } from "@/controllers/hooks/useAuthentication";
import { useSelector } from "react-redux";
import { statementSelector } from "@/redux/statements/statementsSlice";

export function useLeaveFeedback() {
	const [email, setEmail] = useState('');
	const [feedbackText, setFeedbackText] = useState('');
	const [mailStatus, setMailStatus] = useState<'pending' | 'invalid' | 'submitted'>('pending');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { statementId } = useParams();
	const { creator } = useAuthentication();
	const statement = useSelector(statementSelector(statementId));
	const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

	const handleSendButton = async () => {
		// Validate feedback text
		if (!feedbackText.trim()) {
			return;
		}

		// Validate email if provided
		if (email && !emailRegex.test(email)) {
			setMailStatus('invalid');
			
return;
		}

		setIsSubmitting(true);

		try {
			// Generate unique ID for feedback
			const feedbackId = `${statementId}_${creator.uid}_${Date.now()}`;

			const feedback: Feedback = {
				feedbackId,
				statementId: statementId || '',
				statementTitle: statement?.statement || 'Mass Consensus',
				feedbackText: feedbackText.trim(),
				createdAt: Date.now(),
				creator,
				email: email || undefined
			};

			const success = await submitFeedback(feedback);

			if (success) {
				setMailStatus('submitted');
			}
		} catch (error) {
			console.error('Error submitting feedback:', error);
			setIsSubmitting(false);
		}
	};

	const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		setEmail(value);
		if (mailStatus === 'invalid' && (value === '' || emailRegex.test(value))) {
			setMailStatus('pending');
		}
	};

	const handleFeedbackChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		const value = event.target.value;
		if (value.length <= 500) {
			setFeedbackText(value);
		}
	};

	return {
		handleSendButton,
		handleEmailChange,
		handleFeedbackChange,
		mailStatus,
		feedbackText,
		isSubmitting
	};
}

async function submitFeedback(feedback: Feedback): Promise<boolean> {
	const deployedEndPoint = import.meta.env.VITE_APP_FEEDBACK_ENDPOINT ||
		`https://${functionConfig.region}-${firebaseConfig.projectId}.cloudfunctions.net/addFeedback`;
	const localEndPoint = `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/addFeedback`;

	const requestUrl = location.hostname === 'localhost' ? localEndPoint : deployedEndPoint;

	try {
		const response = await fetch(requestUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(feedback),
		});

		const data = await response.json();
		if (response.ok) {
			return true;
		} else {
			console.error('Failed to submit feedback:', data.error || 'Unknown error occurred');
			
return false;
		}
	} catch (err) {
		console.error('Error submitting feedback:', err);
		
return false;
	}
}
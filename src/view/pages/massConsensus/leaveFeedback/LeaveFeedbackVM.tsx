import { useState } from "react";
import firebaseConfig from '@/controllers/db/configKey';
import { functionConfig, Creator } from "delib-npm";
import { useParams } from "react-router";
import { useAuthentication } from "@/controllers/hooks/useAuthentication";

interface MassConsensusMember {
	statementId: string;
	lastUpdate: number;
	email: string;
	creator: Creator;
} //TODO: add to types

export function useLeaveFeedback() {
	const [email, setEmail] = useState('');
	const [MailStatus, setMailStatus] = useState<string>("pending");
	const { statementId } = useParams();
	const { creator } = useAuthentication();
	const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

	const handleSendButton = () => {
		setMailStatus(emailRegex.test(email) ? "valid" : "invalid");
		if (MailStatus !== "valid") return;

		const massConsensusMember: MassConsensusMember = {
			statementId: statementId,
			lastUpdate: Date.now(),
			email: email,
			creator: creator
		}
		addMassConsensusMember(massConsensusMember);
	};

	const handleEmailChange = (value: string) => {
		setEmail(value);
	};

	return { handleSendButton, handleEmailChange, MailStatus };
}

async function addMassConsensusMember(
	member: MassConsensusMember
): Promise<{ success: boolean; error?: string }> {
	const deployedEndPoint = import.meta.env.VITE_APP_MASS_CONSENSUS_ENDPOINT;
	const localEndPoint = `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/massConsensusAddMember`;

	const requestUrl = location.hostname === 'localhost' ? localEndPoint : deployedEndPoint;

	try {
		const response = await fetch(requestUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(member),
		});

		const data = await response.json();
		if (response.ok) {
			return { success: true };
		} else {
			return { success: false, error: data.error || 'Unknown error occurred' };
		}
	} catch (err) {
		console.error(err);

		return { success: false, error: err.message };
	}
}
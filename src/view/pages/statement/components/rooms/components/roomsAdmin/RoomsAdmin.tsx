import { Statement } from "delib-npm";
import { FC } from "react";

import { useSelector } from "react-redux";
import RoomsDivision from "./roomsDivision/RoomsDivision";
import RoomsView from "./roomsView/RoomsView";
import { setNewRoomSettingsToDB } from "@/controllers/db/rooms/setRooms";
import { useLanguage } from "@/controllers/hooks/useLanguages";

import {
	participantsByStatementId,
	roomSettingsByStatementId,
} from "@/model/rooms/roomsSlice";
import { statementSubsSelector } from "@/model/statements/statementsSlice";

interface Props {
  statement: Statement;
}

const RoomsAdmin: FC<Props> = ({ statement }) => {
	const participants = useSelector(
		participantsByStatementId(statement.statementId)
	);

	const topics = useSelector(statementSubsSelector(statement.statementId));

	const { t } = useLanguage();

	const roomSettings = useSelector(
		roomSettingsByStatementId(statement.statementId)
	);

	if (!roomSettings) {
		setNewRoomSettingsToDB(statement.statementId);
	}

	const isEditingRoom =
    roomSettings?.isEdit !== undefined ? roomSettings?.isEdit : true;

	return (
		<div className="rooms-admin wrapper">
			<h2 className="title">{t("Management board")}</h2>
			{isEditingRoom ? (
				<RoomsDivision
					statement={statement}
					roomSettings={roomSettings}
					topics={topics}
					participants={participants}
				/>
			) : (
				<RoomsView statement={statement} participants={participants} />
			)}
		</div>
	);
};

export default RoomsAdmin;

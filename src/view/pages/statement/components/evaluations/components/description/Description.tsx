import { FC, useContext } from "react";
import Text from "@/view/components/text/Text";
import { StatementContext } from "@/view/pages/statement/StatementCont";

const Description: FC = () => {

	const { statement } = useContext(StatementContext);
	if (!statement?.description) {
		return null;
	}

	return (
		<div className="description">
			<Text description={statement.description} />
		</div>
	);
};

export default Description;

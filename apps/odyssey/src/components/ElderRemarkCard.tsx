import type { ElderRemark } from '../lib/elders';

/**
 * An elder's in-character answer to the island the player just submitted.
 * Shown only in the reaction phase (equal-juice rule) and always labeled as
 * an AI persona — the elder is company, never a fellow sailor.
 */
export default function ElderRemarkCard({ remark }: { remark: ElderRemark }) {
	const { elder, line } = remark;

	return (
		<div
			className="panel !py-3 flex flex-col gap-1.5 border-r-4"
			style={{ borderRightColor: elder.color }}
			data-testid="elder-remark"
		>
			<div className="flex items-baseline gap-2">
				<strong className="text-[15px] text-[var(--cream)]">📜 {elder.name}</strong>
				<span className="text-[12px] opacity-70">{elder.role}</span>
			</div>
			<p className="m-0 text-[14px] text-[#dcecf7] italic">{line}</p>
			<p className="m-0 text-[11px] opacity-55">דמות בינה מלאכותית בהשראת דמות היסטורית</p>
		</div>
	);
}

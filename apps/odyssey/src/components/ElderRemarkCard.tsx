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
			<div className="flex items-center gap-2.5">
				{elder.portraitUrl ? (
					// The face the player picked on the crew board, so a remark on the
					// water is recognisably from someone they chose.
					<img
						className="w-9 h-9 rounded-full object-cover border border-[rgba(232,185,88,0.7)] shrink-0"
						src={elder.portraitUrl}
						alt=""
					/>
				) : null}
				<div className="flex items-baseline gap-2 flex-wrap">
					<strong className="text-[15px] text-[var(--cream)]">📜 {elder.name}</strong>
					<span className="text-[12px] opacity-70">{elder.role}</span>
				</div>
			</div>
			<p className="m-0 text-[14px] text-[#dcecf7] italic">{line}</p>
			<p className="m-0 text-[11px] opacity-55">דמות בינה מלאכותית בהשראת דמות היסטורית</p>
		</div>
	);
}

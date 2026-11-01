import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';

export interface CollapsibleDetailsProps {
	children: React.ReactNode;
}

/**
 * A small, collapsed "Details" line. A synthesis card keeps its provenance
 * facts (evaluator split, source ideas) here so that, at first glance, it
 * reads like a plain option card. Closed by default.
 */
const CollapsibleDetails: React.FC<CollapsibleDetailsProps> = ({ children }) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const regionId = `${useId()}-details`;

	return (
		<div className="grouped-suggestion__details">
			<button
				type="button"
				className="grouped-suggestion__details-toggle"
				aria-expanded={open}
				aria-controls={regionId}
				onClick={() => setOpen((value) => !value)}
			>
				<span>{t('Details')}</span>
				<ChevronDown size={14} aria-hidden className="grouped-suggestion__details-chevron" />
			</button>
			{open && (
				<div id={regionId} className="grouped-suggestion__details-body">
					{children}
				</div>
			)}
		</div>
	);
};

export default CollapsibleDetails;

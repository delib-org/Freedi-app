import React, { FC, useState, useEffect } from 'react';
import { setDoc } from 'firebase/firestore';
import {
	Statement,
	JoinFormConfig,
	JoinFormField,
	JoinFormFieldType,
	JoinFormDestination,
} from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import CustomSwitchSmall from '@/view/components/switch/customSwitchSmall/CustomSwitchSmall';
import SectionTitle from '../../sectionTitle/SectionTitle';
import UsersIcon from '@/assets/icons/users20px.svg?react';
import styles from './JoinFormSettings.module.scss';

interface JoinFormSettingsProps {
	statement: Statement;
}

const DEFAULT_FIELDS: JoinFormField[] = [
	{ id: 'name', label: 'Name', type: 'text', required: true },
	{ id: 'phone', label: 'Phone number', type: 'phone', required: true },
	{ id: 'email', label: 'Email address', type: 'email', required: false },
];

function makeFieldId(label: string, existing: JoinFormField[]): string {
	const slug =
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'field';
	let candidate = slug;
	let i = 1;
	while (existing.some((f) => f.id === candidate)) {
		candidate = `${slug}-${i++}`;
	}

	return candidate;
}

async function saveJoinForm(statement: Statement, config: JoinFormConfig): Promise<void> {
	try {
		const ref = createStatementRef(statement.statementId);
		await setDoc(
			ref,
			{
				statementSettings: {
					joinForm: config,
				},
			},
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'JoinFormSettings.saveJoinForm',
			statementId: statement.statementId,
		});
	}
}

const JoinFormSettings: FC<JoinFormSettingsProps> = ({ statement }) => {
	const { t } = useTranslation();

	const existing = statement.statementSettings?.joinForm;
	const [enabled, setEnabled] = useState<boolean>(existing?.enabled ?? false);
	const [destination, setDestination] = useState<JoinFormDestination>(
		existing?.destination ?? 'firestore',
	);
	const [sheetUrl, setSheetUrl] = useState<string>(existing?.sheetUrl ?? '');
	const [fields, setFields] = useState<JoinFormField[]>(
		existing?.fields && existing.fields.length > 0 ? existing.fields : DEFAULT_FIELDS,
	);
	const [serviceAccountEmail, setServiceAccountEmail] = useState<string>('');

	useEffect(() => {
		if (destination !== 'sheets') return;
		// Lazy-load the service account email so admins know whom to share with.
		import('@/controllers/db/joinForm/getSheetServiceAccountEmail')
			.then((m) => m.getSheetServiceAccountEmail())
			.then((email) => setServiceAccountEmail(email ?? ''))
			.catch((error) => {
				logError(error, {
					operation: 'JoinFormSettings.loadServiceAccountEmail',
					statementId: statement.statementId,
				});
			});
	}, [destination, statement.statementId]);

	const persist = (overrides?: Partial<JoinFormConfig>) => {
		const config: JoinFormConfig = {
			enabled,
			destination,
			sheetUrl: destination === 'sheets' ? sheetUrl : undefined,
			fields,
			...overrides,
		};
		saveJoinForm(statement, config);
	};

	const handleToggleEnabled = (next: boolean) => {
		setEnabled(next);
		persist({ enabled: next });
	};

	const handleDestinationChange = (next: JoinFormDestination) => {
		setDestination(next);
		persist({ destination: next, sheetUrl: next === 'sheets' ? sheetUrl : undefined });
	};

	const handleSheetUrlBlur = () => {
		if (destination === 'sheets') persist({ sheetUrl });
	};

	const updateField = (index: number, patch: Partial<JoinFormField>) => {
		const next = fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
		setFields(next);
		persist({ fields: next });
	};

	const addField = () => {
		const newField: JoinFormField = {
			id: makeFieldId('field', fields),
			label: t('New field'),
			type: 'text',
			required: false,
		};
		const next = [...fields, newField];
		setFields(next);
		persist({ fields: next });
	};

	const removeField = (index: number) => {
		const next = fields.filter((_, i) => i !== index);
		setFields(next);
		persist({ fields: next });
	};

	return (
		<>
			<SectionTitle title={t('Join form')} />
			<p className={styles.description}>
				{t(
					'Collect contact details the first time a user joins an option under this question. The form opens once per user; subsequent joins reuse the stored submission.',
				)}
			</p>

			<CustomSwitchSmall
				label={t('Enable join form')}
				checked={enabled}
				setChecked={handleToggleEnabled}
				textChecked={t('Enabled')}
				textUnchecked={t('Disabled')}
				imageChecked={<UsersIcon />}
				imageUnchecked={<UsersIcon />}
				colorChecked="var(--question)"
				colorUnchecked="var(--question)"
			/>

			{enabled && (
				<div className={styles.panel}>
					<div className={styles.destination}>
						<div className={styles.destination__label}>{t('Destination')}</div>
						<label className={styles.destination__option}>
							<input
								type="radio"
								name={`join-form-destination-${statement.statementId}`}
								checked={destination === 'firestore'}
								onChange={() => handleDestinationChange('firestore')}
							/>
							<span>{t('Firestore (default)')}</span>
						</label>
						<label className={styles.destination__option}>
							<input
								type="radio"
								name={`join-form-destination-${statement.statementId}`}
								checked={destination === 'sheets'}
								onChange={() => handleDestinationChange('sheets')}
							/>
							<span>{t('Google Sheet')}</span>
						</label>
					</div>

					{destination === 'sheets' && (
						<div className={styles.sheet}>
							<label className={styles.sheet__label}>
								{t('Google Sheet URL')}
								<input
									type="url"
									className={styles.sheet__input}
									value={sheetUrl}
									onChange={(e) => setSheetUrl(e.target.value)}
									onBlur={handleSheetUrlBlur}
									placeholder="https://docs.google.com/spreadsheets/d/..."
								/>
							</label>
							{serviceAccountEmail && (
								<p className={styles.sheet__hint}>
									{t('Share this sheet with:')} <code>{serviceAccountEmail}</code>
								</p>
							)}
						</div>
					)}

					<div className={styles.fields}>
						<div className={styles.fields__header}>
							<span>{t('Field label')}</span>
							<span>{t('Field type')}</span>
							<span>{t('Required')}</span>
							<span />
						</div>
						{fields.map((field, index) => (
							<div key={field.id} className={styles.fields__row}>
								<input
									className={styles.fields__label}
									type="text"
									value={field.label}
									onChange={(e) => updateField(index, { label: e.target.value })}
								/>
								<select
									className={styles.fields__type}
									value={field.type}
									onChange={(e) =>
										updateField(index, { type: e.target.value as JoinFormFieldType })
									}
								>
									<option value="text">{t('Text')}</option>
									<option value="phone">{t('Phone')}</option>
									<option value="email">{t('Email')}</option>
								</select>
								<label className={styles.fields__required}>
									<input
										type="checkbox"
										checked={field.required}
										onChange={(e) => updateField(index, { required: e.target.checked })}
									/>
								</label>
								<button
									type="button"
									className={styles.fields__remove}
									onClick={() => removeField(index)}
									aria-label={t('Remove field')}
								>
									×
								</button>
							</div>
						))}
						<button type="button" className={styles.fields__add} onClick={addField}>
							+ {t('Add field')}
						</button>
					</div>
				</div>
			)}
		</>
	);
};

export default JoinFormSettings;

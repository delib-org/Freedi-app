import React, { useState } from 'react';
import Input from '@/view/components/input/Input';

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/controllers/db/config';

interface ProfanityResponse {
    score: number;
}

const checkProfanity = httpsCallable<{ text: string }, ProfanityResponse>(
    functions,
    'checkProfanity'
);

interface Props {
    name: string;
    label?: string;
    placeholder?: string;
    onValidChange: (cleanText: string) => void;
    autoFocus?: boolean;
}

const ProfanityControlledInput: React.FC<Props> = ({
    name,
    label,
    placeholder,
    onValidChange,
    autoFocus = false,
}) => {
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleChange = async (text: string) => {
        setValue(text);
        setError(null);

        try {
            const response = await checkProfanity({ text });
            const { score } = response.data;

            if (score !== null && score > 0.7) {
                setError('Inappropriate content detected');
                onValidChange('');
            } else {
                onValidChange(text);
            }
        } catch (err) {
            console.error('Profanity check failed:', err);
            setError('Error checking content');
        }
    };

    return (
        <div>
            <Input
                name={name}
                label={label}
                placeholder={placeholder}
                value={value}
                onChange={handleChange}
                autoFocus={autoFocus}
            />
            {error && <div style={{ color: 'red' }}>{error}</div>}
        </div>
    );
};

export default ProfanityControlledInput;

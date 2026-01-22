import { Metadata } from 'next';
import AccessibilityStatementContent from './AccessibilityStatementContent';

export const metadata: Metadata = {
  title: 'Accessibility Statement - WizCol-Sign',
  description: 'Our commitment to digital accessibility and IS 5568 compliance',
};

export default function AccessibilityStatementPage() {
  return <AccessibilityStatementContent />;
}

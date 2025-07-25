import React from 'react';
import { NotificationDiagnostics } from '@/view/components/notifications/NotificationDiagnostics';
import styles from './Settings.module.scss';

export default function Settings() {
    return (
        <div className={styles.settings}>
            <h1>Settings</h1>
            
            <section>
                <h2>Notifications</h2>
                <NotificationDiagnostics />
            </section>
            
            {/* Add other settings sections here */}
        </div>
    );
}
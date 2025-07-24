import { useState, useEffect } from 'react';
import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { App } from '@capacitor/app';
import './NativeFeatureDemo.scss';

interface DeviceInfo {
	platform?: string;
	model?: string;
	operatingSystem?: string;
	osVersion?: string;
	manufacturer?: string;
	isVirtual?: boolean;
	webViewVersion?: string;
}

interface NetworkStatus {
	connected?: boolean;
	connectionType?: string;
}

export function NativeFeatureDemo() {
	const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({});
	const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({});
	const [appInfo, setAppInfo] = useState<{ version?: string; build?: string }>({});

	useEffect(() => {
		// Get device info
		const loadDeviceInfo = async () => {
			try {
				const info = await Device.getInfo();
				setDeviceInfo(info);
			} catch (error) {
				console.error('Error getting device info:', error);
			}
		};

		// Get network status
		const loadNetworkStatus = async () => {
			try {
				const status = await Network.getStatus();
				setNetworkStatus(status);
			} catch (error) {
				console.error('Error getting network status:', error);
			}
		};

		// Get app info
		const loadAppInfo = async () => {
			try {
				const info = await App.getInfo();
				setAppInfo(info);
			} catch (error) {
				console.error('Error getting app info:', error);
			}
		};

		loadDeviceInfo();
		loadNetworkStatus();
		loadAppInfo();

		// Listen for network changes
		const setupListeners = async () => {
			const networkListener = await Network.addListener('networkStatusChange', (status) => {
				setNetworkStatus(status);
			});

			// Listen for app state changes
			const stateListener = await App.addListener('appStateChange', (state) => {
				console.info('App state changed:', state.isActive ? 'active' : 'background');
			});

			// Cleanup function
			return () => {
				networkListener.remove();
				stateListener.remove();
			};
		};

		const cleanupPromise = setupListeners();

		return () => {
			cleanupPromise.then(cleanup => cleanup());
		};
	}, []);

	const triggerHaptic = async (style: ImpactStyle) => {
		try {
			await Haptics.impact({ style });
		} catch (error) {
			console.error('Haptic feedback not available:', error);
		}
	};

	return (
		<div className="native-feature-demo">
			<h2>Native Features Demo</h2>

			<section className="native-feature-demo__section">
				<h3>Device Information</h3>
				<div className="native-feature-demo__info">
					<p>Platform: {deviceInfo.platform || 'Loading...'}</p>
					<p>Model: {deviceInfo.model || 'Loading...'}</p>
					<p>OS: {deviceInfo.operatingSystem || 'Loading...'}</p>
					<p>Version: {deviceInfo.osVersion || 'Loading...'}</p>
					<p>Manufacturer: {deviceInfo.manufacturer || 'Loading...'}</p>
					<p>Virtual: {deviceInfo.isVirtual ? 'Yes' : 'No'}</p>
				</div>
			</section>

			<section className="native-feature-demo__section">
				<h3>Network Status</h3>
				<div className="native-feature-demo__info">
					<p>Connected: {networkStatus.connected ? 'Yes' : 'No'}</p>
					<p>Type: {networkStatus.connectionType || 'Unknown'}</p>
				</div>
			</section>

			<section className="native-feature-demo__section">
				<h3>App Information</h3>
				<div className="native-feature-demo__info">
					<p>Version: {appInfo.version || 'Loading...'}</p>
					<p>Build: {appInfo.build || 'Loading...'}</p>
				</div>
			</section>

			<section className="native-feature-demo__section">
				<h3>Haptic Feedback</h3>
				<div className="native-feature-demo__buttons">
					<button onClick={() => triggerHaptic(ImpactStyle.Light)}>Light Haptic</button>
					<button onClick={() => triggerHaptic(ImpactStyle.Medium)}>Medium Haptic</button>
					<button onClick={() => triggerHaptic(ImpactStyle.Heavy)}>Heavy Haptic</button>
				</div>
			</section>
		</div>
	);
}
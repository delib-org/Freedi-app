import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { defaultFontSize } from '../../model/fonts/fontsModel';
import { RootState } from '../store';
import { parse } from 'valibot';
import { User, UserSchema } from '@/types/user/User';
import { UserSettings } from '@/types/user/UserSettings';
import { Agreement } from '@/types/agreement/Agreement';

export enum Status {
	idle = 'idle',
	loading = 'loading',
	failed = 'failed',
}

// Define a type for the slice state
interface UserState {
	user: User | null;
	status: Status;
	colorContrast: boolean;
	userSettings: UserSettings | null;
}

// Define the initial state using that type
const initialState: UserState = {
	user: null,
	status: Status.idle,
	colorContrast: false,
	userSettings: null,
};

export const userSlicer = createSlice({
	name: 'user',
	initialState,
	reducers: {
		setUser: (state, action: PayloadAction<User | null>) => {
			try {
				if (action.payload) {
					const user = parse(UserSchema, action.payload);
					if (
						!user.fontSize ||
						typeof user.fontSize !== 'number' ||
						isNaN(user.fontSize)
					)
						user.fontSize = defaultFontSize;

					state.user = action.payload;
				} else {
					state.user = null;
				}
			} catch (error) {
				console.error(error);
			}
		},
		increaseFontSize: (state, action: PayloadAction<number>) => {
			try {
				if (!state.user) return;
				if (!state.user?.fontSize)
					state.user.fontSize = defaultFontSize;

				state.user.fontSize += action.payload;
				if (state.user.fontSize < 10) state.user.fontSize = 10;
				if (state.user.fontSize > 30) state.user.fontSize = 30;
			} catch (error) {
				console.error(error);
			}
		},
		setFontSize: (state, action: PayloadAction<number>) => {
			try {
				if (!state.user) return;

				state.user.fontSize = action.payload;
				if (state.user.fontSize < 10) state.user.fontSize = 10;
				if (state.user.fontSize > 30) state.user.fontSize = 30;
			} catch (error) {
				console.error(error);
			}
		},
		updateAgreementToStore: (
			state: UserState,
			action: PayloadAction<Agreement | undefined>
		) => {
			try {
				if (!state.user) return;

				if (!action.payload) {
					delete state.user.agreement;

					return;
				}

				const agreement = action.payload;
				state.user.agreement = agreement;
			} catch (error) {
				console.error(error);
			}
		},
		toggleColorContrast: (state) => {
			state.colorContrast = !state.colorContrast;
		},
		setColorContrast: (state, action: PayloadAction<boolean>) => {
			state.colorContrast = action.payload;
		},
		setUserSettings: (
			state,
			action: PayloadAction<UserSettings | null>
		) => {
			state.userSettings = action.payload;
		},
	},
});

export const {
	setUser,
	increaseFontSize,
	setFontSize,
	updateAgreementToStore,
	toggleColorContrast,
	setColorContrast,
	setUserSettings,
} = userSlicer.actions;

// Other code such as selectors can use the imported `RootState` type
export const userSelector = (state: RootState) => state.user.user;
export const statusSelector = (state: RootState) => state.user.status;
export const fontSizeSelector = (state: RootState) =>
	state.user.user?.fontSize || defaultFontSize;
export const colorContrastSelector = (state: RootState) =>
	state.user.colorContrast;

export const userSettingsSelector = (state: RootState) =>
	state.user.userSettings;

export default userSlicer.reducer;

// redux/snackbarSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type SnackbarType = "alert" | "info" | "confirmation";

interface SnackbarState {
  open: boolean;
  type: SnackbarType;
  title: string | null;
  content: string | null;
  buttons?: {
    label: string;
    action: () => void;
  }[];
}

const initialState: SnackbarState = {
  open: false,
  type: "info",
  title: null,
  content: null,
  buttons: [],
};

const snackbarSlice = createSlice({
  name: "snackbar",
  initialState,
  reducers: {
    showSnackbar(
      state,
      action: PayloadAction<{
        type: SnackbarType;
        title: string;
        content: string;
        buttons?: {
          label: string;
          action: () => void;
        }[];
      }>
    ) {
      state.open = true;
      state.type = action.payload.type;
      state.title = action.payload.title;
      state.content = action.payload.content;
      state.buttons = action.payload.buttons || [];
    },
    hideSnackbar(state) {
      state.open = false;
      state.title = null;
      state.content = null;
      state.buttons = [];
    },
  },
});

export const { showSnackbar, hideSnackbar } = snackbarSlice.actions;
export default snackbarSlice.reducer;

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  pagesSearch: string;
}

const initialState: UiState = { pagesSearch: '' };

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setPagesSearch(state, action: PayloadAction<string>) {
      state.pagesSearch = action.payload;
    },
  },
});

export const { setPagesSearch } = uiSlice.actions;
export default uiSlice.reducer;
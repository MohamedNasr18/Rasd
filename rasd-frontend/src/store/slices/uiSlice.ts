import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type PagesFilter = 'all' | 'issues' | 'rescanned';

interface UiState {
  pagesSearch: string;
  pagesFilter: PagesFilter;
}

const initialState: UiState = { pagesSearch: '', pagesFilter: 'all' };

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setPagesSearch(state, action: PayloadAction<string>) {
      state.pagesSearch = action.payload;
    },
    setPagesFilter(state, action: PayloadAction<PagesFilter>) {
      state.pagesFilter = action.payload;
    },
  },
});

export const { setPagesSearch, setPagesFilter } = uiSlice.actions;
export default uiSlice.reducer;

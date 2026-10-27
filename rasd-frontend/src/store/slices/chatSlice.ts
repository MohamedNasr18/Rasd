import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface LocalMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationState {
  conversationId?: string;
  messages: LocalMessage[];
}

interface ChatState {
  byScan: Record<string, ConversationState>;
}

const initialState: ChatState = { byScan: {} };

const ensure = (state: ChatState, siteScanId: string) =>
  (state.byScan[siteScanId] ??= { messages: [] });

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    userMessageAdded(state, a: PayloadAction<{ siteScanId: string; content: string }>) {
      ensure(state, a.payload.siteScanId).messages.push({
        role: 'user',
        content: a.payload.content,
      });
    },
    assistantReplied(
      state,
      a: PayloadAction<{ siteScanId: string; conversationId: string; content: string }>,
    ) {
      const conv = ensure(state, a.payload.siteScanId);
      conv.conversationId = a.payload.conversationId;
      conv.messages.push({ role: 'assistant', content: a.payload.content });
    },
    chatReset(state, a: PayloadAction<string>) {
      delete state.byScan[a.payload];
    },
  },
});

export const { userMessageAdded, assistantReplied, chatReset } = chatSlice.actions;
export default chatSlice.reducer;
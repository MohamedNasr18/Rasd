'use client';
import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useSendChatMessageMutation } from '@/store/api';
import { assistantReplied, chatReset, userMessageAdded, type LocalMessage } from '@/store/slices/chatSlice';
import Markdown from './Markdown';
import { useI18n } from '@/i18n/I18nProvider';

const EMPTY: LocalMessage[] = [];

export default function ChatPanel({ siteScanId }: { siteScanId: string }) {
  const { locale, dict } = useI18n();
  const copy = dict.chat;
  const dispatch = useAppDispatch();
  const conversationId = useAppSelector((s) => s.chat.byScan[siteScanId]?.conversationId);
  const messages = useAppSelector((s) => s.chat.byScan[siteScanId]?.messages ?? EMPTY);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [send, { isLoading }] = useSendChatMessageMutation();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el || messages.length === 0) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, isLoading]);

  async function submit(text: string) {
    const message = text.trim();
    if (!message || isLoading) return;
    setError(null);
    setInput('');
    dispatch(userMessageAdded({ siteScanId, content: message }));
    try {
      const res = await send({ siteScanId, message, conversationId, lang: locale }).unwrap();
      dispatch(
        assistantReplied({
          siteScanId,
          conversationId: res.conversationId,
          content: res.reply,
        }),
      );
    } catch {
      setError(copy.error);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{copy.title}</h2>
        {messages.length > 0 && (
          <button
            onClick={() => dispatch(chatReset(siteScanId))}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            {copy.newConversation}
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-white">
        <div ref={listRef} className="h-96 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-2 text-sm text-gray-500">
              <p>{copy.intro}</p>
              <div className="flex flex-wrap gap-2">
                {copy.suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => submit(q)}
                    className="rounded-full border px-3 py-1 text-gray-700 hover:border-blue-400"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div
                dir="auto"
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                  m.role === 'user' ? 'whitespace-pre-wrap bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                }`}
              >
                {m.role === 'user' ? m.content : <Markdown>{m.content}</Markdown>}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-end">
              <div className="rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500">
                {copy.thinking}
              </div>
            </div>
          )}
        </div>

        {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex gap-2 border-t p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={copy.placeholder}
            className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            disabled={isLoading || !input.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {copy.send}
          </button>
        </form>
      </div>
    </section>
  );
}

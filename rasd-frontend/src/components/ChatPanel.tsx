'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, Lock, RotateCcw, Send, Sparkles } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useSendChatMessageMutation } from '@/store/api';
import { assistantReplied, chatReset, userMessageAdded, type LocalMessage } from '@/store/slices/chatSlice';
import Markdown from './Markdown';
import { useI18n } from '@/i18n/I18nProvider';

const EMPTY: LocalMessage[] = [];

export default function ChatPanel({
  siteScanId,
  locked = false,
}: {
  siteScanId: string;
  locked?: boolean;
}) {
  const { locale, dir, dict } = useI18n();
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
    <section dir={dir} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Bot size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">{copy.title}</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-800">
                <Sparkles size={12} />
                {copy.badge}
              </span>
            </div>
            <p className="text-sm text-gray-600">{copy.subtitle}</p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => dispatch(chatReset(siteScanId))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
          >
            <RotateCcw size={14} />
            {copy.newConversation}
          </button>
        )}
      </div>

      <div className="mt-5 flex min-h-[440px] flex-col rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
        {locked ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Lock size={28} />
            </div>
            <div className="max-w-sm space-y-1.5">
              <h3 className="text-lg font-bold text-gray-900">{copy.lockedTitle}</h3>
              <p className="text-sm text-gray-600">{copy.lockedBody}</p>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-all hover:bg-gray-50"
            >
              {copy.lockedCta}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 shadow-sm">
              <Bot size={30} />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-lg font-bold text-gray-900">{copy.emptyTitle}</h3>
              <p className="text-sm text-gray-600">{copy.intro}</p>
            </div>
            <div className="flex max-w-xl flex-wrap items-center justify-center gap-2 pt-2">
              {copy.suggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => submit(q)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={listRef} className="max-h-[420px] flex-1 space-y-4 overflow-y-auto px-1">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                {m.role === 'user' ? (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ss-sm bg-blue-600 p-4 text-sm leading-relaxed text-white shadow-sm sm:max-w-[75%]">
                    <span dir="auto">{m.content}</span>
                  </div>
                ) : (
                  <div className="max-w-[92%] rounded-2xl rounded-se-sm border border-gray-200 bg-white p-5 text-sm leading-relaxed text-gray-900 shadow-sm sm:max-w-[85%]">
                    <div className="mb-3 flex items-center gap-2 border-b border-gray-200 pb-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-[10px] font-bold text-blue-700">
                        {copy.assistantInitial}
                      </div>
                      <span className="text-sm font-bold">{copy.assistantName}</span>
                    </div>
                    <Markdown>{m.content}</Markdown>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-end">
                <div className="inline-flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs text-gray-600 shadow-sm">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:0.3s]" />
                  </span>
                  {copy.thinking}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="flex items-center gap-1.5 pt-2 text-sm text-red-600">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="mt-4 flex items-center gap-2 border-t border-gray-200 pt-4"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={copy.placeholder}
            disabled={locked}
            className="w-full flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-500 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            disabled={locked || isLoading || !input.trim()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
          >
            <span>{copy.send}</span>
            <Send size={16} className={dir === 'rtl' ? 'rotate-180' : undefined} />
          </button>
        </form>
      </div>
    </section>
  );
}

import { describe, it, expect, vi } from 'vitest';
import { ChatService } from '../src/chat/chat.service.js';

function makeService(replies: string[], guidance: string[] = ['[web.dev - INP] chunk']) {
  const invokes: any[] = [];
  let capturedPrompt = '';

  const prisma = {
    siteScan: { findUnique: async () => ({ id: 'scan-1', siteId: 'site-1' }) },
    conversation: {
      create: async () => ({ id: 'conv-1', messages: [] }),
      findUniqueOrThrow: async () => ({ id: 'conv-1', messages: [] }),
    },
    message: { create: async () => ({}) },
  } as any;

  const aggregator = {
    buildContext: async () => ({
      siteUrl: 'https://example.com',
      pageCount: 2,
      averageScore: 71,
      aggregatedChecks: [],
    }),
  } as any;

  const kb = { retrieveGuidance: async () => guidance } as any;

  const agentService = {
    createAgent: (_scanId: string, _siteId: string, systemPrompt: string) => {
      capturedPrompt = systemPrompt;
      return {
        invoke: async (input: any) => {
          invokes.push(input);
          const reply = replies[Math.min(invokes.length - 1, replies.length - 1)];
          return { messages: [{ content: reply }] };
        },
      };
    },
  } as any;

  return {
    service: new ChatService(prisma, agentService, aggregator, kb),
    invokes,
    getPrompt: () => capturedPrompt,
  };
}

describe('ChatService knowledge grounding', () => {
  it('injects fixed facts and retrieved guidance into the system prompt', async () => {
    const { service, getPrompt } = makeService(['رد سليم']);
    await service.sendMessage('scan-1', 'إيه مقاييس Core Web Vitals؟');

    const prompt = getPrompt();
    expect(prompt).toContain('حقائق ثابتة');
    expect(prompt).toContain('مارس 2024');
    expect(prompt).toContain('onFID');
    expect(prompt).toContain('[web.dev - INP] chunk');
  });

  it('decorates retrieved chunks with their source', async () => {
    const { service, getPrompt } = makeService(['رد'], ['[web.dev - INP] تفاصيل INP']);
    await service.sendMessage('scan-1', 'إيه INP؟');
    expect(getPrompt()).toContain('[web.dev - INP] تفاصيل INP');
  });
});

describe('ChatService FID stale-claim guard', () => {
  it('regenerates once when FID is presented as a current metric', async () => {
    const { service, invokes } = makeService([
      'المقاييس: LCP وFID وCLS. وتقدر تقيسه بـ onFID(console.log).',
      'المقاييس الحالية: LCP وINP وCLS.',
    ]);

    const res = await service.sendMessage('scan-1', 'إيه مقاييس Core Web Vitals؟');

    expect(invokes).toHaveLength(2);
    expect(String(invokes[1].messages.at(-1).content)).toContain('اتشال في مارس 2024');
    expect(res.reply).toBe('المقاييس الحالية: LCP وINP وCLS.');
  });

  it('does not regenerate when the reply says FID was retired (real reply phrasing)', async () => {
    const { service, invokes } = makeService([
      'مقياس FID تم إيقافه في مارس 2024 وحلّته INP، فـ FID ما بقىش جزء من Core Web Vitals.',
    ]);

    const res = await service.sendMessage('scan-1', 'إيه المقاييس الحالية؟');

    expect(invokes).toHaveLength(1);
    expect(res.reply).toContain('تم إيقافه');
  });

  it('does not regenerate for other retirement wordings', async () => {
    for (const reply of [
      'مقياس FID متقاعد وحل محله INP.',
      'FID was replaced by INP in March 2024.',
      'FID is no longer a Core Web Vital.',
      'INP هو بديل FID.',
    ]) {
      const { service, invokes } = makeService([reply]);
      await service.sendMessage('scan-1', 'سؤال');
      expect(invokes, `should not regenerate: ${reply}`).toHaveLength(1);
    }
  });

  it('does not regenerate for a clean INP-only answer', async () => {
    const { service, invokes } = makeService(['INP بيقيس استجابة الصفحة لكل التفاعلات.']);
    await service.sendMessage('scan-1', 'إيه INP؟');
    expect(invokes).toHaveLength(1);
  });

  it('regenerates when onFID is used in code even if the text says FID is retired', async () => {
    const { service, invokes } = makeService([
      'FID اتشال، بس لو لسه بتستخدمه: onFID(console.log);',
      'استخدم INP: onINP(console.log);',
    ]);

    await service.sendMessage('scan-1', 'إزاي أقيس التفاعل؟');

    expect(invokes).toHaveLength(2);
  });

  it('warns when the regenerated reply is still stale', async () => {
    const { service, invokes } = makeService(['FID مقياس حالي', 'FID لسه مقياس']);
    const warn = vi.spyOn((service as any).logger, 'warn');

    const res = await service.sendMessage('scan-1', 'إيه المقاييس؟');

    expect(invokes).toHaveLength(2);
    expect(res.reply).toBe('FID لسه مقياس');
    expect(warn).toHaveBeenCalledWith('Stale claim (FID) detected in reply, regenerating once');
    expect(warn).toHaveBeenCalledWith('Reply still contains a stale FID claim after regeneration');
    warn.mockRestore();
  });
});

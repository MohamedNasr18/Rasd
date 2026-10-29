import { Injectable, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { GUEST_COOKIE, SESSION_COOKIE } from './auth.constants.js';
import { generateToken, hashToken } from './crypto.js';
import { getCookie, setGuestCookie } from './request.utils.js';

export interface Viewer {
  userId: string | null;
  guestSessionId: string | null;
  guestToken: string | null;
}

export const ANONYMOUS: Viewer = { userId: null, guestSessionId: null, guestToken: null };

@Injectable()
export class ViewerService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(req: Request): Promise<Viewer> {
    const sessionToken = getCookie(req, SESSION_COOKIE);
    const guestToken = getCookie(req, GUEST_COOKIE);

    let userId: string | null = null;
    if (sessionToken) {
      const session = await this.prisma.session.findUnique({
        where: { tokenHash: hashToken(sessionToken) },
        select: { userId: true, expiresAt: true },
      });
      if (session && session.expiresAt > new Date()) {
        userId = session.userId;
      } else if (session) {
        await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(sessionToken) } });
      }
    }

    let guestSessionId: string | null = null;
    if (guestToken) {
      const guest = await this.prisma.guestSession.findUnique({
        where: { tokenHash: hashToken(guestToken) },
        select: { id: true },
      });
      guestSessionId = guest?.id ?? null;
    }

    return { userId, guestSessionId, guestToken: guestToken ?? null };
  }

  async ensureGuestSession(req: Request, res: Response): Promise<string> {
    const existing = getCookie(req, GUEST_COOKIE);
    if (existing) {
      const guest = await this.prisma.guestSession.findUnique({
        where: { tokenHash: hashToken(existing) },
        select: { id: true },
      });
      if (guest) return guest.id;
    }

    const token = generateToken();
    const guest = await this.prisma.guestSession.create({
      data: { tokenHash: hashToken(token) },
      select: { id: true },
    });
    setGuestCookie(res, token);
    return guest.id;
  }

  async migrateGuestScans(guestToken: string | null, userId: string): Promise<number> {
    if (!guestToken) return 0;
    const guest = await this.prisma.guestSession.findUnique({
      where: { tokenHash: hashToken(guestToken) },
      select: { id: true },
    });
    if (!guest) return 0;

    const [updated] = await this.prisma.$transaction([
      this.prisma.siteScan.updateMany({
        where: { guestSessionId: guest.id, userId: null },
        data: { userId, guestSessionId: null },
      }),
      this.prisma.guestSession.update({
        where: { id: guest.id },
        data: { migratedToId: userId },
      }),
    ]);
    return updated.count;
  }

  async assertCanView(siteScanId: string, viewer: Viewer): Promise<void> {
    const scan = await this.prisma.siteScan.findUnique({
      where: { id: siteScanId },
      select: { userId: true, guestSessionId: true },
    });
    if (!scan) throw new NotFoundException('Site scan not found.');
    if (this.canView(scan, viewer)) return;
    throw new NotFoundException('Site scan not found.');
  }

  async assertCanViewConversation(conversationId: string, viewer: Viewer): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { siteScan: { select: { userId: true, guestSessionId: true } } },
    });
    if (!conversation || !this.canView(conversation.siteScan, viewer)) {
      throw new NotFoundException('Conversation not found.');
    }
  }

  canView(scan: { userId: string | null; guestSessionId: string | null }, viewer: Viewer): boolean {
    if (scan.userId) return scan.userId === viewer.userId;
    if (scan.guestSessionId) return scan.guestSessionId === viewer.guestSessionId;
    return true;
  }

  ownerScope(viewer: Viewer): { userId: string } | { guestSessionId: string } | null {
    if (viewer.userId) return { userId: viewer.userId };
    if (viewer.guestSessionId) return { guestSessionId: viewer.guestSessionId };
    return null;
  }
}

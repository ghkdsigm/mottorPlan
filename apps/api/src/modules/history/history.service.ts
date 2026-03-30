import { Injectable } from "@nestjs/common";
import type { HistoryItem } from "@mottor-plan/shared";
import type { GenerationSession } from "@prisma/client";
import { PrismaService } from "../persistence/prisma.service";

@Injectable()
export class HistoryService {
  private readonly fallbackHistory: HistoryItem[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<HistoryItem[]> {
    if (!this.prisma.isReady()) {
      return this.fallbackHistory;
    }

    const sessions = await this.prisma.generationSession.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });

    return sessions.map((session: GenerationSession) => ({
      id: session.id,
      title: session.workspaceName,
      createdAt: session.createdAt.toISOString(),
      summary: session.prompt
    }));
  }

  pushFallback(item: HistoryItem) {
    this.fallbackHistory.unshift(item);
    this.fallbackHistory.splice(20);
  }
}

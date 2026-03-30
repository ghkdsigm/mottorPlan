import { Injectable } from "@nestjs/common";
import type { ArtifactDocument, GenerationResponse, WorkspaceArtifactSet } from "@mottor-plan/shared";
import type { Prisma } from "@prisma/client";
import { HistoryService } from "../history/history.service";
import { LlmService } from "../llm/llm.service";
import { PrismaService } from "../persistence/prisma.service";
import { GenerateArtifactsDto } from "./dto";

type DocumentRecordInput = {
  kind: "PRD" | "FEATURE_SPEC" | "USER_FLOW";
  title: string;
  version: string;
  generatedAt: Date;
  sections: Prisma.InputJsonValue;
};

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
    private readonly historyService: HistoryService
  ) {}

  async generate(payload: GenerateArtifactsDto): Promise<GenerationResponse> {
    const llmOutput = await this.llmService.generateArtifacts(payload.workspaceName, payload.prompt);
    const sessionId = crypto.randomUUID();

    if (this.prisma.isReady()) {
      await this.prisma.generationSession.create({
        data: {
          id: sessionId,
          workspaceName: payload.workspaceName,
          prompt: payload.prompt,
          suggestedActions: llmOutput.suggestedActions,
          documents: {
            create: this.mapDocuments(llmOutput.artifacts)
          }
        }
      });
    } else {
      this.historyService.pushFallback({
        id: sessionId,
        title: payload.workspaceName,
        createdAt: new Date().toISOString(),
        summary: payload.prompt
      });
    }

    return {
      sessionId,
      artifacts: llmOutput.artifacts,
      suggestedActions: llmOutput.suggestedActions
    };
  }

  private mapDocuments(artifacts: WorkspaceArtifactSet): DocumentRecordInput[] {
    return [
      {
        kind: "PRD",
        title: artifacts.prd.title,
        version: artifacts.prd.version,
        generatedAt: new Date(artifacts.prd.generatedAt),
        sections: artifacts.prd.sections as unknown as Prisma.InputJsonValue
      },
      {
        kind: "FEATURE_SPEC",
        title: artifacts.featureSpec.title,
        version: artifacts.featureSpec.version,
        generatedAt: new Date(artifacts.featureSpec.generatedAt),
        sections: artifacts.featureSpec.sections as unknown as Prisma.InputJsonValue
      },
      {
        kind: "USER_FLOW",
        title: artifacts.userFlow.title,
        version: artifacts.userFlow.version,
        generatedAt: new Date(artifacts.userFlow.generatedAt),
        sections: artifacts.userFlow.sections as unknown as Prisma.InputJsonValue
      }
    ];
  }
}

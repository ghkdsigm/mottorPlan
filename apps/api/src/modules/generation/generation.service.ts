import { BadRequestException, Injectable } from "@nestjs/common";
import type { GenerationResponse } from "@mottor-plan/shared";
import { LlmService } from "../llm/llm.service";
import { ProjectsService } from "../projects/projects.service";
import { GenerateArtifactsDto } from "./dto";

@Injectable()
export class GenerationService {
  constructor(
    private readonly llmService: LlmService,
    private readonly projectsService: ProjectsService
  ) {}

  async generate(payload: GenerateArtifactsDto): Promise<GenerationResponse> {
    if (!payload.projectId && !payload.workspaceName) {
      throw new BadRequestException("projectId 또는 workspaceName 중 하나는 필요합니다.");
    }

    const project = payload.projectId
      ? await this.projectsService.getProjectSummary(payload.projectId)
      : await this.projectsService.createProject({
          name: payload.workspaceName ?? "새 프로젝트"
        });

    const projectDetail = await this.projectsService.getProjectDetail(project.id);
    const llmOutput = await this.llmService.generateProjectArtifacts({
      projectName: project.name,
      prompt: payload.prompt,
      targetArtifact: payload.targetArtifact,
      currentArtifacts: projectDetail.artifacts,
      recentLogs: projectDetail.logs.slice(0, 8),
      contextSummary: projectDetail.contextSummary
    });

    return this.projectsService.saveGenerationResult({
      projectId: project.id,
      prompt: payload.prompt,
      targetArtifact: payload.targetArtifact,
      artifacts: llmOutput.artifacts,
      suggestedActions: llmOutput.suggestedActions,
      contextSummary: llmOutput.contextSummary,
      qualityChecklists: llmOutput.qualityChecklists
    });
  }
}

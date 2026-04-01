import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ArtifactDocument,
  ArtifactKey,
  ArtifactVersionSummary,
  CreateProjectRequest,
  GenerationLogItem,
  GenerationResponse,
  ProjectDetail,
  ProjectSummary,
  WorkspaceArtifactSet
} from "@mottor-plan/shared";
import { ArtifactKind as PrismaArtifactKind, type Prisma } from "@prisma/client";
import { PrismaService } from "../persistence/prisma.service";

type DocumentRow = {
  id: string;
  kind: PrismaArtifactKind;
  title: string;
  version: string;
  generatedAt: Date;
  sections: unknown;
  visualization?: unknown;
  parentDocumentId?: string | null;
  createdAt: Date;
};

type ProjectRecord = {
  id: string;
  name: string;
  domainType: string | null;
  contextSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
  sessions: SessionWithDocuments[];
};

type SessionWithDocuments = {
  id: string;
  projectId: string;
  prompt: string;
  suggestedActions: unknown;
  contextSummary?: string | null;
  createdAt: Date;
  targetArtifact?: PrismaArtifactKind | null;
  documents: DocumentRow[];
};

type SaveGenerationResultInput = {
  projectId: string;
  prompt: string;
  targetArtifact?: ArtifactKey;
  domainType: string;
  artifacts: WorkspaceArtifactSet;
  suggestedActions: string[];
  contextSummary: string;
  qualityChecklists: Record<ArtifactKey, string[]>;
};

type FallbackProjectState = {
  project: ProjectSummary;
  artifacts: WorkspaceArtifactSet;
  suggestedActions: string[];
  contextSummary: string;
  logs: GenerationLogItem[];
  versions: Record<ArtifactKey, ArtifactVersionSummary[]>;
};

const artifactKeyOrder: ArtifactKey[] = ["prd", "featureSpec", "policySpec", "userFlow", "flowChart", "screenSpec"];

const artifactKeyToKind: Record<ArtifactKey, PrismaArtifactKind> = {
  prd: PrismaArtifactKind.PRD,
  featureSpec: PrismaArtifactKind.FEATURE_SPEC,
  policySpec: PrismaArtifactKind.POLICY_SPEC,
  userFlow: PrismaArtifactKind.USER_FLOW,
  flowChart: PrismaArtifactKind.FLOW_CHART,
  screenSpec: PrismaArtifactKind.SCREEN_SPEC
};

const kindToArtifactKey: Record<PrismaArtifactKind, ArtifactKey> = {
  [PrismaArtifactKind.PRD]: "prd",
  [PrismaArtifactKind.FEATURE_SPEC]: "featureSpec",
  [PrismaArtifactKind.POLICY_SPEC]: "policySpec",
  [PrismaArtifactKind.USER_FLOW]: "userFlow",
  [PrismaArtifactKind.FLOW_CHART]: "flowChart",
  [PrismaArtifactKind.SCREEN_SPEC]: "screenSpec"
};

@Injectable()
export class ProjectsService {
  private readonly fallbackProjects = new Map<string, FallbackProjectState>();

  constructor(private readonly prisma: PrismaService) {}

  async listProjects(): Promise<ProjectSummary[]> {
    if (!this.prisma.isReady()) {
      return Array.from(this.fallbackProjects.values())
        .map((item) => item.project)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }

    const projects = (await (this.prisma as any).project.findMany({
      orderBy: {
        updatedAt: "desc"
      },
      include: {
        sessions: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    })) as Array<ProjectRecord>;

    return projects.map((project) => this.mapProjectSummary(project, project.sessions[0]));
  }

  async createProject(payload: CreateProjectRequest): Promise<ProjectSummary> {
    const normalizedName = payload.name.trim();
    const normalizedDomainType = this.normalizeDomainType(payload.domainType);
    if (!normalizedName) {
      throw new NotFoundException("프로젝트 이름이 필요합니다.");
    }

    if (!this.prisma.isReady()) {
      const project: ProjectSummary = {
        id: crypto.randomUUID(),
        name: normalizedName,
        domainType: normalizedDomainType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        contextSummary: `${normalizedName} 프로젝트 생성 (${normalizedDomainType} 도메인)`,
        latestSessionId: undefined,
        lastPrompt: ""
      };

      this.fallbackProjects.set(project.id, {
        project,
        artifacts: this.createEmptyArtifacts(normalizedName),
        suggestedActions: this.createDefaultSuggestedActions(),
        contextSummary: `${normalizedName} 프로젝트 생성 (${normalizedDomainType} 도메인)`,
        logs: [],
        versions: this.createEmptyVersionMap()
      });

      return project;
    }

    const project = (await (this.prisma as any).project.create({
      data: {
        name: normalizedName,
        domainType: normalizedDomainType,
        contextSummary: `${normalizedName} 프로젝트 생성 (${normalizedDomainType} 도메인)`
      }
    })) as ProjectRecord;

    return this.mapProjectSummary(project);
  }

  async getProjectSummary(projectId: string): Promise<ProjectSummary> {
    if (!this.prisma.isReady()) {
      const state = this.fallbackProjects.get(projectId);
      if (!state) {
        throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
      }
      return state.project;
    }

    const project = (await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      include: {
        sessions: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      }
    })) as ProjectRecord | null;

    if (!project) {
      throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
    }

    return this.mapProjectSummary(project, project.sessions[0]);
  }

  async getProjectDetail(projectId: string): Promise<ProjectDetail> {
    if (!this.prisma.isReady()) {
      const state = this.fallbackProjects.get(projectId);
      if (!state) {
        throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
      }

      return {
        project: state.project,
        artifacts: state.artifacts,
        suggestedActions: state.suggestedActions,
        contextSummary: state.contextSummary,
        logs: state.logs,
        versions: state.versions
      };
    }

    const project = (await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      include: {
        sessions: {
          orderBy: {
            createdAt: "desc"
          },
          include: {
            documents: {
              orderBy: {
                createdAt: "desc"
              }
            }
          }
        }
      }
    })) as ProjectRecord | null;

    if (!project) {
      throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
    }

    return this.buildProjectDetail(project);
  }

  async listRecentLogs(): Promise<GenerationLogItem[]> {
    if (!this.prisma.isReady()) {
      return Array.from(this.fallbackProjects.values())
        .flatMap((item) => item.logs)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 20);
    }

    const sessions = (await (this.prisma as any).generationSession.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 20,
      include: {
        project: true
      }
    })) as Array<SessionWithDocuments & { project: { name: string } }>;

    return sessions.map((session) => this.mapGenerationLog(session, session.project.name));
  }

  async saveGenerationResult(input: SaveGenerationResultInput): Promise<GenerationResponse> {
    if (!this.prisma.isReady()) {
      return this.saveFallbackGenerationResult(input);
    }

    const project = (await (this.prisma as any).project.findUnique({
      where: { id: input.projectId },
      include: {
        sessions: {
          include: {
            documents: {
              orderBy: {
                createdAt: "desc"
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    })) as ProjectRecord | null;

    if (!project) {
      throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
    }

    const latestVersions = this.getLatestVersionMap(project.sessions);
    const versionCounts = this.getVersionCounts(project.sessions);
    const sessionId = crypto.randomUUID();

    await (this.prisma as any).generationSession.create({
      data: {
        id: sessionId,
        projectId: input.projectId,
        prompt: input.prompt,
        targetArtifact: input.targetArtifact ? artifactKeyToKind[input.targetArtifact] : undefined,
        suggestedActions: input.suggestedActions as unknown as Prisma.InputJsonValue,
        contextSummary: input.contextSummary,
        documents: {
          create: artifactKeyOrder.map((artifactKey) => {
            const document = input.artifacts[artifactKey];
            return {
              kind: artifactKeyToKind[artifactKey],
              title: document.title,
              version: this.buildNextVersion(versionCounts[artifactKey] ?? 0),
              generatedAt: new Date(document.generatedAt),
              sections: document.sections as unknown as Prisma.InputJsonValue,
              visualization: document.visualization
                ? (document.visualization as unknown as Prisma.InputJsonValue)
                : undefined,
              qualityChecklist: input.qualityChecklists[artifactKey] as unknown as Prisma.InputJsonValue,
              parentDocumentId: latestVersions[artifactKey]?.id ?? null
            };
          })
        }
      }
    });

    await (this.prisma as any).project.update({
      where: { id: input.projectId },
      data: {
        domainType: input.domainType,
        contextSummary: input.contextSummary
      }
    });

    const detail = await this.getProjectDetail(input.projectId);

    return {
      project: detail.project,
      sessionId: detail.logs[0]?.sessionId ?? sessionId,
      artifacts: input.artifacts,
      suggestedActions: input.suggestedActions,
      contextSummary: input.contextSummary,
      logs: detail.logs,
      versions: detail.versions
    };
  }

  private saveFallbackGenerationResult(input: SaveGenerationResultInput): GenerationResponse {
    const state = this.fallbackProjects.get(input.projectId);
    if (!state) {
      throw new NotFoundException("프로젝트를 찾을 수 없습니다.");
    }

    const sessionId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    for (const artifactKey of artifactKeyOrder) {
      const previousVersion = state.versions[artifactKey][0];
      state.versions[artifactKey].unshift({
        id: crypto.randomUUID(),
        kind: artifactKeyToKind[artifactKey].toLowerCase().replaceAll("_", "-") as ArtifactDocument["kind"],
        title: input.artifacts[artifactKey].title,
        version: this.buildNextVersion(state.versions[artifactKey].length),
        generatedAt: input.artifacts[artifactKey].generatedAt,
        sessionId,
        parentDocumentId: previousVersion?.id ?? null
      });
      state.versions[artifactKey] = state.versions[artifactKey].slice(0, 10);
    }

    state.logs.unshift({
      sessionId,
      projectId: state.project.id,
      projectName: state.project.name,
      prompt: input.prompt,
      createdAt,
      targetArtifact: input.targetArtifact,
      summary: this.summarizePrompt(input.prompt)
    });
    state.logs = state.logs.slice(0, 20);
    state.artifacts = input.artifacts;
    state.suggestedActions = input.suggestedActions;
    state.contextSummary = input.contextSummary;
    state.project = {
      ...state.project,
      domainType: input.domainType,
      updatedAt: createdAt,
      latestSessionId: sessionId,
      lastPrompt: input.prompt,
      contextSummary: input.contextSummary
    };

    return {
      project: state.project,
      sessionId,
      artifacts: input.artifacts,
      suggestedActions: input.suggestedActions,
      contextSummary: input.contextSummary,
      logs: state.logs,
      versions: state.versions
    };
  }

  private buildProjectDetail(project: ProjectRecord): ProjectDetail {
    const latestVersions = this.getLatestVersionMap(project.sessions);

    return {
      project: this.mapProjectSummary(project, project.sessions[0]),
      artifacts: this.buildArtifactsFromVersions(project.name, latestVersions),
      suggestedActions:
        (project.sessions[0]?.suggestedActions as unknown as string[] | undefined) ?? this.createDefaultSuggestedActions(),
      contextSummary: project.contextSummary ?? this.createDefaultContextSummary(project.name),
      logs: project.sessions.map((session) => this.mapGenerationLog(session, project.name)).slice(0, 20),
      versions: this.buildVersionMap(project.sessions)
    };
  }

  private buildArtifactsFromVersions(
    projectName: string,
    versions: Partial<Record<ArtifactKey, DocumentRow>>
  ): WorkspaceArtifactSet {
    const fallback = this.createEmptyArtifacts(projectName);

    return {
      prd: this.mapArtifactDocument(versions.prd, fallback.prd),
      featureSpec: this.mapArtifactDocument(versions.featureSpec, fallback.featureSpec),
      policySpec: this.mapArtifactDocument(versions.policySpec, fallback.policySpec),
      userFlow: this.mapArtifactDocument(versions.userFlow, fallback.userFlow),
      flowChart: this.mapArtifactDocument(versions.flowChart, fallback.flowChart),
      screenSpec: this.mapArtifactDocument(versions.screenSpec, fallback.screenSpec)
    };
  }

  private mapArtifactDocument(document: DocumentRow | undefined, fallback: ArtifactDocument): ArtifactDocument {
    if (!document) {
      return fallback;
    }

    return {
      kind: kindToArtifactKey[document.kind].replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`) as ArtifactDocument["kind"],
      title: document.title,
      version: document.version,
      generatedAt: document.generatedAt.toISOString(),
      sections: document.sections as unknown as ArtifactDocument["sections"],
      visualization: document.visualization as unknown as ArtifactDocument["visualization"]
    };
  }

  private buildVersionMap(sessions: SessionWithDocuments[]): Record<ArtifactKey, ArtifactVersionSummary[]> {
    const versions = this.createEmptyVersionMap();

    for (const session of sessions) {
      for (const document of session.documents) {
        const artifactKey = kindToArtifactKey[document.kind];
        versions[artifactKey].push({
          id: document.id,
          kind: this.mapDocumentKind(document.kind),
          title: document.title,
          version: document.version,
          generatedAt: document.generatedAt.toISOString(),
          sessionId: session.id,
          parentDocumentId: document.parentDocumentId
        });
      }
    }

    for (const artifactKey of artifactKeyOrder) {
      versions[artifactKey] = versions[artifactKey]
        .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
        .slice(0, 10);
    }

    return versions;
  }

  private getLatestVersionMap(sessions: SessionWithDocuments[]): Partial<Record<ArtifactKey, DocumentRow>> {
    const latest: Partial<Record<ArtifactKey, DocumentRow>> = {};

    for (const session of sessions) {
      for (const document of session.documents) {
        const artifactKey = kindToArtifactKey[document.kind];
        if (!latest[artifactKey]) {
          latest[artifactKey] = document;
        }
      }
    }

    return latest;
  }

  private getVersionCounts(sessions: SessionWithDocuments[]): Partial<Record<ArtifactKey, number>> {
    const counts: Partial<Record<ArtifactKey, number>> = {};

    for (const session of sessions) {
      for (const document of session.documents) {
        const artifactKey = kindToArtifactKey[document.kind];
        counts[artifactKey] = (counts[artifactKey] ?? 0) + 1;
      }
    }

    return counts;
  }

  private mapGenerationLog(session: SessionWithDocuments, projectName: string): GenerationLogItem {
    return {
      sessionId: session.id,
      projectId: session.projectId,
      projectName,
      prompt: session.prompt,
      createdAt: session.createdAt.toISOString(),
      targetArtifact: session.targetArtifact ? kindToArtifactKey[session.targetArtifact] : undefined,
      summary: this.summarizePrompt(session.prompt)
    };
  }

  private mapProjectSummary(
    project: { id: string; name: string; domainType?: string | null; contextSummary: string | null; createdAt: Date; updatedAt: Date },
    latestSession?: SessionWithDocuments
  ): ProjectSummary {
    return {
      id: project.id,
      name: project.name,
      domainType: project.domainType ?? undefined,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      contextSummary: project.contextSummary ?? undefined,
      latestSessionId: latestSession?.id,
      lastPrompt: latestSession?.prompt
    };
  }

  private createEmptyArtifacts(projectName: string): WorkspaceArtifactSet {
    const generatedAt = new Date().toISOString();
    const createDocument = (kind: ArtifactDocument["kind"], title: string): ArtifactDocument => ({
      kind,
      title,
      version: "v0.0",
      generatedAt,
      sections: [
        {
          title: "아직 생성된 문서가 없습니다",
          summary: "새 프로젝트를 만든 뒤 요청을 입력하면 시니어급 기획 산출물을 누적 생성합니다.",
          bullets: [
            "프로젝트 컨텍스트와 생성 로그가 이곳에 축적됩니다.",
            "PRD부터 흐름도차트까지 순차적으로 생성됩니다."
          ]
        }
      ]
    });

    return {
      prd: createDocument("prd", `${projectName} PRD`),
      featureSpec: createDocument("feature-spec", `${projectName} 기능명세서`),
      policySpec: createDocument("policy-spec", `${projectName} 정책서`),
      userFlow: createDocument("user-flow", `${projectName} 유저플로우`),
      flowChart: createDocument("flow-chart", `${projectName} 흐름도차트`),
      screenSpec: createDocument("screen-spec", `${projectName} 화면기획서`)
    };
  }

  private createDefaultSuggestedActions() {
    return ["핵심 정책을 더 구체화해줘", "운영자 시나리오를 보강해줘", "예외 흐름을 더 촘촘하게 정리해줘"];
  }

  private createDefaultContextSummary(projectName: string) {
    return `${projectName} 프로젝트의 최신 문서와 요청 로그를 바탕으로 다음 산출물을 개선합니다.`;
  }

  private normalizeDomainType(domainType: string | undefined) {
    const normalized = domainType?.trim();
    return normalized || "general";
  }

  private createEmptyVersionMap(): Record<ArtifactKey, ArtifactVersionSummary[]> {
    return {
      prd: [],
      featureSpec: [],
      policySpec: [],
      userFlow: [],
      flowChart: [],
      screenSpec: []
    };
  }

  private summarizePrompt(prompt: string) {
    return prompt.length > 96 ? `${prompt.slice(0, 96)}...` : prompt;
  }

  private buildNextVersion(previousCount: number) {
    return `v${previousCount + 1}.0`;
  }

  private mapDocumentKind(kind: PrismaArtifactKind): ArtifactDocument["kind"] {
    switch (kind) {
      case PrismaArtifactKind.PRD:
        return "prd";
      case PrismaArtifactKind.FEATURE_SPEC:
        return "feature-spec";
      case PrismaArtifactKind.POLICY_SPEC:
        return "policy-spec";
      case PrismaArtifactKind.USER_FLOW:
        return "user-flow";
      case PrismaArtifactKind.FLOW_CHART:
        return "flow-chart";
      case PrismaArtifactKind.SCREEN_SPEC:
        return "screen-spec";
    }
  }
}

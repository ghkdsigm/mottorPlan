import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ArtifactDocument,
  ArtifactKey,
  ArtifactSection,
  FeatureFlowVisualization,
  FlowChartVisualization,
  GenerationLogItem,
  PolicyTableVisualization,
  ScreenSpecInput,
  ScreenSpecVisualization,
  TreeMapVisualization,
  WorkspaceArtifactSet
} from "@mottor-plan/shared";

type StageOutput = {
  document: ArtifactDocument;
};

type GenerationPipelineInput = {
  projectName: string;
  domainType: string;
  prompt: string;
  screenInputs: ScreenSpecInput[];
  targetArtifact?: ArtifactKey;
  currentArtifacts: WorkspaceArtifactSet;
  recentLogs: GenerationLogItem[];
  contextSummary: string;
};

type GenerationPipelineOutput = {
  artifacts: WorkspaceArtifactSet;
  suggestedActions: string[];
  contextSummary: string;
  qualityChecklists: Record<ArtifactKey, string[]>;
};

const artifactOrder: ArtifactKey[] = ["prd", "featureSpec", "policySpec", "userFlow", "flowChart", "screenSpec"];

@Injectable()
export class LlmService {
  constructor(private readonly configService: ConfigService) {}

  async generateProjectArtifacts(input: GenerationPipelineInput): Promise<GenerationPipelineOutput> {
    const workingArtifacts: WorkspaceArtifactSet = { ...input.currentArtifacts };
    const generatedAt = new Date().toISOString();
    const startIndex = this.resolveStartIndex(input.targetArtifact, input.currentArtifacts);

    for (let index = 0; index < artifactOrder.length; index += 1) {
      const artifactKey = artifactOrder[index];
      const shouldRegenerate = index >= startIndex;

      if (!shouldRegenerate && this.isGeneratedDocument(workingArtifacts[artifactKey])) {
        continue;
      }

      const generatedDocument = await this.generateArtifactStage({
        artifactKey,
        generatedAt,
        projectName: input.projectName,
        domainType: input.domainType,
        prompt: input.prompt,
        screenInputs: input.screenInputs,
        contextSummary: input.contextSummary,
        recentLogs: input.recentLogs,
        currentArtifacts: workingArtifacts
      });

      workingArtifacts[artifactKey] = generatedDocument;
    }

    if (startIndex === 0) {
      workingArtifacts.prd = await this.refinePrdDocument({
        generatedAt,
        projectName: input.projectName,
        domainType: input.domainType,
        prompt: input.prompt,
        screenInputs: input.screenInputs,
        contextSummary: input.contextSummary,
        recentLogs: input.recentLogs,
        currentArtifacts: workingArtifacts
      });
    }

    const qualityChecklists = this.buildQualityChecklistMap(workingArtifacts);

    return {
      artifacts: workingArtifacts,
      suggestedActions: this.buildSuggestedActions(workingArtifacts, input.prompt, input.domainType),
      contextSummary: this.buildContextSummary(input.projectName, input.prompt, workingArtifacts, input.domainType),
      qualityChecklists
    };
  }

  private async generateArtifactStage(input: {
    artifactKey: ArtifactKey;
    generatedAt: string;
    projectName: string;
    domainType: string;
    prompt: string;
    screenInputs: ScreenSpecInput[];
    contextSummary: string;
    recentLogs: GenerationLogItem[];
    currentArtifacts: WorkspaceArtifactSet;
    supportingArtifactsSummary?: string;
    generationDirective?: string;
  }): Promise<ArtifactDocument> {
    const response = await this.requestStageOutput(input);

    if (response?.document) {
      return {
        ...response.document,
        generatedAt: input.generatedAt,
        version: "draft"
      };
    }

    return this.buildTemplateDocument(
      input.artifactKey,
      input.projectName,
      input.domainType,
      input.prompt,
      input.generatedAt,
      input.currentArtifacts,
      input.screenInputs,
      input.generationDirective
    );
  }

  private async refinePrdDocument(input: {
    generatedAt: string;
    projectName: string;
    domainType: string;
    prompt: string;
    screenInputs: ScreenSpecInput[];
    contextSummary: string;
    recentLogs: GenerationLogItem[];
    currentArtifacts: WorkspaceArtifactSet;
  }): Promise<ArtifactDocument> {
    const supportingArtifactsSummary = this.buildArtifactSummaryList(
      ["featureSpec", "policySpec", "userFlow", "flowChart", "screenSpec"],
      input.currentArtifacts
    );

    return this.generateArtifactStage({
      artifactKey: "prd",
      generatedAt: input.generatedAt,
      projectName: input.projectName,
      domainType: input.domainType,
      prompt: input.prompt,
      screenInputs: input.screenInputs,
      contextSummary: input.contextSummary,
      recentLogs: input.recentLogs,
      currentArtifacts: input.currentArtifacts,
      supportingArtifactsSummary,
      generationDirective:
        "이번 PRD는 최종 정제본이다. 기능명세서, 정책서, 유저플로우, 흐름도차트의 내용을 역으로 참고해 PRD를 더 구체적이고 무겁게 정리하라. 다른 산출물과 충돌하는 모호한 표현은 제거하고, 범위/우선순위/타임라인/제외범위를 명확히 적어라."
    });
  }

  private async requestStageOutput(input: {
    artifactKey: ArtifactKey;
    generatedAt: string;
    projectName: string;
    domainType: string;
    prompt: string;
    screenInputs: ScreenSpecInput[];
    contextSummary: string;
    recentLogs: GenerationLogItem[];
    currentArtifacts: WorkspaceArtifactSet;
    supportingArtifactsSummary?: string;
    generationDirective?: string;
  }): Promise<StageOutput | null> {
    const apiKey = this.configService.get<string>("LLM_API_KEY");
    const baseUrl = this.configService.get<string>("LLM_BASE_URL");
    const model = this.configService.get<string>("LLM_MODEL") ?? "gpt-4.1-mini";

    if (!apiKey || !baseUrl) {
      return null;
    }

    try {
      const userContent = this.buildStageUserContent(input);
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "너는 대규모 B2B SaaS를 다루는 시니어 제품기획 리드다. 반드시 한국어 JSON만 응답한다. 문서는 실무 구현 가능성, 권한/예외 흐름, 운영 관점, 추적 가능성을 반영해야 한다."
            },
            {
              role: "user",
              content: userContent
            }
          ]
        })
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        return null;
      }

      return JSON.parse(content) as StageOutput;
    } catch {
      return null;
    }
  }

  private buildStageUserContent(input: {
    artifactKey: ArtifactKey;
    generatedAt: string;
    projectName: string;
    domainType: string;
    prompt: string;
    screenInputs: ScreenSpecInput[];
    contextSummary: string;
    recentLogs: GenerationLogItem[];
    currentArtifacts: WorkspaceArtifactSet;
    supportingArtifactsSummary?: string;
    generationDirective?: string;
  }) {
    const text = this.buildStagePrompt(input);

    if (input.artifactKey !== "screenSpec" || input.screenInputs.length === 0) {
      return text;
    }

    return [
      { type: "text", text },
      ...input.screenInputs.slice(0, 6).map((screenInput) => ({
        type: "image_url",
        image_url: {
          url: screenInput.imageDataUrl,
          detail: "high"
        }
      }))
    ];
  }

  private buildStagePrompt(input: {
    artifactKey: ArtifactKey;
    generatedAt: string;
    projectName: string;
    domainType: string;
    prompt: string;
    screenInputs: ScreenSpecInput[];
    contextSummary: string;
    recentLogs: GenerationLogItem[];
    currentArtifacts: WorkspaceArtifactSet;
    supportingArtifactsSummary?: string;
    generationDirective?: string;
  }) {
    const previousArtifacts = this.buildArtifactSummaryList(
      artifactOrder.slice(0, artifactOrder.indexOf(input.artifactKey)),
      input.currentArtifacts
    );

    const recentLogs = input.recentLogs
      .slice(0, 5)
      .map((log) => `- ${log.createdAt}: ${log.summary}`)
      .join("\n");

    const domainKnowledgeLayer = this.buildDomainKnowledgeLayer(input.domainType);
    const screenInputSummary = input.screenInputs.length ? this.buildScreenInputSummary(input.screenInputs) : "";

    return [
      "다음 형식으로만 응답해.",
      '{ "document": { "kind": "", "title": "", "version": "draft", "generatedAt": "", "sections": [], "visualization": {} } }',
      "sections는 최소 3개 이상이며, 각 section은 title, summary, bullets를 가진다.",
      "bullets는 무엇을/왜/예외사항 중심으로 작성한다.",
      this.getStageSchema(input.artifactKey),
      this.getStageQualityRules(input.artifactKey),
      `프로젝트명: ${input.projectName}`,
      `도메인 유형: ${input.domainType}`,
      `도메인 지식 계층:\n${domainKnowledgeLayer}`,
      `현재 요청: ${input.prompt}`,
      screenInputSummary ? `화면 입력 요약:\n${screenInputSummary}` : "",
      input.generationDirective ? `추가 지시사항: ${input.generationDirective}` : "",
      `누적 컨텍스트 요약: ${input.contextSummary}`,
      recentLogs ? `최근 생성 로그:\n${recentLogs}` : "최근 생성 로그: 없음",
      previousArtifacts ? `이전 단계 산출물 요약:\n${previousArtifacts}` : "이전 단계 산출물 요약: 없음",
      input.supportingArtifactsSummary ? `참고 산출물 요약:\n${input.supportingArtifactsSummary}` : "",
      `이번에 생성할 대상: ${input.artifactKey}`,
      `generatedAt에는 ${input.generatedAt}를 사용해`
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private getStageSchema(artifactKey: ArtifactKey) {
    switch (artifactKey) {
      case "prd":
        return [
          'document.kind는 "prd"다.',
          'visualization은 포함하지 않아도 된다.',
          "PRD는 가볍게 쓰지 말고 실제 리뷰 가능한 수준으로 상세히 작성한다.",
          "section title은 다음 항목을 빠짐없이 포함해야 한다: 프로젝트명, 설명, 문제, 왜, 성공, 고객, 무엇, 어떻게, 언제.",
          "프로젝트명은 간결하고 명확한 이름으로 작성한다.",
          "설명은 무엇인지에 대한 간략한 설명을 작성한다.",
          "문제는 이 기능이 해결하려는 구체적인 문제를 적는다.",
          "왜는 이 문제가 해결할 가치가 있다는 근거와 사업적 이유를 적는다.",
          "성공은 이 문제가 해결됐는지 측정할 수 있는 KPI와 측정 방식을 적는다.",
          "고객은 대상 사용자 그룹과 핵심 특성을 적는다.",
          "무엇은 제품에서 이 기능이 어떤 모습으로 제공될지, 핵심 범위와 요구사항을 적는다.",
          "어떻게는 검증 또는 실험 계획, 출시 전 확인 항목을 적는다.",
          "언제는 주요 마일스톤과 배포 계획을 적는다."
        ].join("\n");
      case "featureSpec":
        return [
          'document.kind는 "feature-spec"다.',
          'visualization은 반드시 { "type": "feature-flow", "rootNodeId": "", "nodes": [{ "id": "", "label": "", "description": "", "column": 0, "accent": "primary|secondary|neutral" }], "edges": [{ "from": "", "to": "", "label": "" }] } 구조를 따른다.',
          "기능명세는 기능 단위, 권한, 상태, 예외 처리, 비기능 요구사항을 포함한다."
        ].join("\n");
      case "policySpec":
        return [
          'document.kind는 "policy-spec"다.',
          'visualization은 반드시 { "type": "policy-table", "title": "", "columns": [{ "key": "", "label": "" }], "rows": [{ "id": "", "values": { "columnKey": "cellValue" } }] } 구조를 따른다.',
          "정책 테이블은 권한, 조건, 승인, 예외, 감사/비고 항목이 드러나게 설계한다."
        ].join("\n");
      case "userFlow":
        return [
          'document.kind는 "user-flow"다.',
          'visualization은 반드시 { "type": "tree-map", "title": "", "root": { "id": "", "label": "", "description": "", "accent": "primary|secondary|neutral", "children": [] } } 구조를 따른다.',
          "트리는 depth 제한 없이 확장 가능해야 하며 역할별 진입점과 주요 경로가 드러나야 한다."
        ].join("\n");
      case "flowChart":
        return [
          'document.kind는 "flow-chart"다.',
          'visualization은 반드시 { "type": "flow-chart", "title": "", "nodes": [{ "id": "", "label": "", "description": "", "column": 0, "row": 0, "shape": "terminator|process|decision|document|subprocess", "accent": "primary|secondary|neutral" }], "edges": [{ "from": "", "to": "", "label": "" }] } 구조를 따른다.',
          "흐름도는 위에서 아래로 진행되고, 조건 분기는 좌우로 확장되며 실패/재처리 경로를 포함한다."
        ].join("\n");
      case "screenSpec":
        return [
          'document.kind는 "screen-spec"다.',
          'visualization은 반드시 { "type": "screen-spec", "title": "", "screens": [{ "id": "", "screenId": "", "screenName": "", "route": "", "systemName": "", "author": "", "createdDate": "", "imageDataUrl": "", "imageName": "", "notes": "", "markers": [{ "id": "", "number": 1, "x": 12, "y": 20, "title": "", "description": "" }], "descriptionSections": [{ "id": "", "title": "", "bullets": [""] }], "functionalRequirements": [{ "id": "", "no": 1, "title": "", "description": "" }], "policyReferences": [{ "id": "", "policyName": "", "summary": "" }], "relatedScreens": [{ "id": "", "label": "", "targetScreenId": "", "description": "" }], "changeLog": [{ "id": "", "date": "", "description": "" }] }] } 구조를 따른다.',
          "화면기획서는 업로드된 이미지의 주요 영역을 번호 마커로 표시하고, 우측 설명/기능정의/정책/수정로그와 연결한다.",
          "샘플 대기업 산출물처럼 메타 정보, 화면 설명, 기능정의, 정책 연결, 관련 화면, 수정 로그를 포함한다."
        ].join("\n");
    }
  }

  private getStageQualityRules(artifactKey: ArtifactKey) {
    const commonRules = [
      "문서 간 용어를 일관되게 유지한다.",
      "애매한 표현 대신 구현 가능한 수준의 정책/흐름/예외를 적는다.",
      "실무 검토에 필요한 누락 항목이 없도록 작성한다."
    ];

    const stageRules: Record<ArtifactKey, string[]> = {
      prd: [
        "프로젝트명/설명/문제/왜/성공/고객/무엇/어떻게/언제를 각각 분리한다.",
        "문제와 왜는 구체적인 현업 pain point와 추진 근거 중심으로 적는다.",
        "성공에는 KPI와 측정 방법을 함께 적는다.",
        "고객과 무엇에는 대상 사용자와 제품 범위를 명확히 적는다.",
        "어떻게에는 실험 계획 또는 검증 계획을 포함한다.",
        "가능하면 다른 산출물과 연결되는 근거를 PRD 문장에 녹인다."
      ],
      featureSpec: ["기능별 흐름과 시스템 책임, 예외 처리, 비기능 요구사항을 분리한다."],
      policySpec: ["권한, 승인, 예외, 조건, 로그 관점을 테이블에 반영한다."],
      userFlow: ["메뉴 구조뿐 아니라 사용자 역할별 주요 경로를 포함한다."],
      flowChart: ["업무 절차, 분기, 실패, 재시도, 완료 경로를 반드시 표현한다."],
      screenSpec: [
        "이미지와 설명 영역의 번호 매핑을 명확히 유지한다.",
        "기능정의는 실제 구현/운영 검토가 가능한 수준으로 구체화한다.",
        "정책서와 유저플로우의 용어, 상태, 경로와 충돌하지 않게 작성한다.",
        "수정 로그와 관련 화면 연결을 포함한다."
      ]
    };

    return ["품질 규칙:", ...commonRules, ...stageRules[artifactKey]].map((line) => `- ${line}`).join("\n");
  }

  private resolveStartIndex(targetArtifact: ArtifactKey | undefined, currentArtifacts: WorkspaceArtifactSet) {
    if (!targetArtifact) {
      return 0;
    }

    const requestedIndex = artifactOrder.indexOf(targetArtifact);
    for (let index = 0; index < requestedIndex; index += 1) {
      if (!this.isGeneratedDocument(currentArtifacts[artifactOrder[index]])) {
        return 0;
      }
    }

    return requestedIndex;
  }

  private isGeneratedDocument(document: ArtifactDocument) {
    return document.version !== "v0.0";
  }

  private buildQualityChecklistMap(artifacts: WorkspaceArtifactSet): Record<ArtifactKey, string[]> {
    return {
      prd: this.buildQualityChecklist("prd", artifacts.prd),
      featureSpec: this.buildQualityChecklist("featureSpec", artifacts.featureSpec),
      policySpec: this.buildQualityChecklist("policySpec", artifacts.policySpec),
      userFlow: this.buildQualityChecklist("userFlow", artifacts.userFlow),
      flowChart: this.buildQualityChecklist("flowChart", artifacts.flowChart),
      screenSpec: this.buildQualityChecklist("screenSpec", artifacts.screenSpec)
    };
  }

  private buildQualityChecklist(artifactKey: ArtifactKey, document: ArtifactDocument): string[] {
    const sections = document.sections.map((section) => section.title).join(", ");
    const visualization = document.visualization?.type ?? "none";

    const base = [
      `섹션 구성 확인: ${sections || "없음"}`,
      `시각화 타입 확인: ${visualization}`,
      `문서 길이 확인: 섹션 ${document.sections.length}개`
    ];

    switch (artifactKey) {
      case "prd":
        return [
          ...base,
          "프로젝트명/설명/문제/왜/성공/고객/무엇/어떻게/언제를 모두 포함했는지 확인",
          "KPI가 측정 가능한 수치 또는 기준으로 표현됐는지 확인",
          "문제 정의와 추진 근거, 실험 계획, 마일스톤이 구체적인지 확인"
        ];
      case "featureSpec":
        return [...base, "기능 플로우, 예외 처리, 비기능 요구사항을 포함했는지 확인"];
      case "policySpec":
        return [...base, "정책 컬럼 구조와 권한/예외 조건이 충분한지 확인"];
      case "userFlow":
        return [...base, "역할별 진입점과 depth 구조가 표현되었는지 확인"];
      case "flowChart":
        return [...base, "분기, 재처리, 종료 흐름이 연결되었는지 확인"];
      case "screenSpec":
        return [
          ...base,
          "화면 메타/번호 마커/설명/기능정의/정책 연결/관련 화면/수정 로그가 포함됐는지 확인",
          "업로드 이미지와 화면 설명의 번호 매핑이 자연스러운지 확인",
          "정책서와 유저플로우 기준 용어 및 이동 경로가 일관되는지 확인"
        ];
    }
  }

  private buildSuggestedActions(artifacts: WorkspaceArtifactSet, prompt: string, domainType: string): string[] {
    return [
      `${domainType} 도메인 기준으로 핵심 엔터티와 상태 전이를 더 구체화해줘`,
      `이 요청에서 놓친 운영 정책을 ${artifacts.policySpec.title} 기준으로 보강해줘`,
      `${artifacts.userFlow.title}를 관리자/운영자 관점으로 확장해줘`,
      `${artifacts.screenSpec.title}의 화면 번호와 기능정의를 더 촘촘하게 보강해줘`,
      `${prompt.slice(0, 48)} 관련 예외 흐름과 실패 처리 시나리오를 추가해줘`
    ];
  }

  private buildContextSummary(projectName: string, prompt: string, artifacts: WorkspaceArtifactSet, domainType: string) {
    return [
      `${projectName} 프로젝트는 ${domainType} 도메인 기준의 지식 계층과 최신 요청 "${prompt}"를 반영해 문서를 갱신했습니다.`,
      `현재 PRD는 ${artifacts.prd.sections[0]?.title ?? "목표"}를 기준으로 범위를 정의합니다.`,
      `기능명세와 정책서는 구현/운영 규칙을 분리했고, 유저플로우와 흐름도는 이를 사용자/업무 절차 관점으로 연결합니다.`,
      `화면기획서는 실제 화면 이미지와 기능/정책/이동 흐름을 연결한 리뷰용 문서로 정리합니다.`
    ].join(" ");
  }

  private summarizeDocument(document: ArtifactDocument) {
    return [
      `${document.title} (${document.kind})`,
      ...document.sections.map((section) => `- ${section.title}: ${section.summary}`)
    ].join("\n");
  }

  private buildArtifactSummaryList(keys: ArtifactKey[], currentArtifacts: WorkspaceArtifactSet) {
    return keys
      .filter((artifactKey) => this.isGeneratedDocument(currentArtifacts[artifactKey]))
      .map((artifactKey) => this.summarizeDocument(currentArtifacts[artifactKey]))
      .join("\n\n");
  }

  private buildScreenInputSummary(screenInputs: ScreenSpecInput[]) {
    return screenInputs
      .map(
        (screenInput, index) =>
          `- 화면 ${index + 1}: ${screenInput.screenName} (${screenInput.screenId})${screenInput.route ? ` / ${screenInput.route}` : ""}${
            screenInput.notes ? ` / 메모: ${screenInput.notes}` : ""
          }`
      )
      .join("\n");
  }

  private buildTemplateDocument(
    artifactKey: ArtifactKey,
    projectName: string,
    domainType: string,
    prompt: string,
    generatedAt: string,
    currentArtifacts: WorkspaceArtifactSet,
    screenInputs: ScreenSpecInput[],
    generationDirective?: string
  ): ArtifactDocument {
    switch (artifactKey) {
      case "prd":
        const downstreamReferences = [
          this.isGeneratedDocument(currentArtifacts.featureSpec)
            ? `${currentArtifacts.featureSpec.title}에서 기능 범위와 우선순위를 참고합니다.`
            : "기능명세서는 이후 기능 범위와 우선순위 상세화의 기준이 됩니다.",
          this.isGeneratedDocument(currentArtifacts.policySpec)
            ? `${currentArtifacts.policySpec.title}에서 권한, 승인, 예외 정책을 반영합니다.`
            : "정책서는 권한, 승인, 예외 처리 기준으로 이어집니다.",
          this.isGeneratedDocument(currentArtifacts.userFlow)
            ? `${currentArtifacts.userFlow.title}에서 역할별 사용자 여정을 참고합니다.`
            : "유저플로우는 사용자 여정과 진입 경로를 구체화합니다.",
          this.isGeneratedDocument(currentArtifacts.flowChart)
            ? `${currentArtifacts.flowChart.title}에서 실제 업무 절차와 분기 흐름을 참고합니다.`
            : "흐름도차트는 실제 운영 절차와 분기 조건을 정리합니다."
        ];

        return this.createDocument("prd", `${projectName} PRD`, generatedAt, [
          {
            title: "프로젝트명",
            summary: `${projectName}`,
            bullets: [
              "간결하고 명확한 프로젝트 명칭을 사용합니다.",
              `도메인 기준: ${domainType}`,
              generationDirective ? `추가 정제 방향: ${generationDirective}` : "추가 정제 방향: 실제 리뷰 가능한 기획 문서 수준으로 정리합니다."
            ]
          },
          {
            title: "설명",
            summary: `${projectName} 프로젝트는 ${prompt} 요구를 해결하기 위한 제품/기능 기획입니다.`,
            bullets: [
              `무엇인지: ${prompt} 요구를 서비스/업무 흐름에 반영하는 방안을 정의합니다.`,
              "제품, 정책, 사용자 흐름, 업무 절차를 하나의 기준 문서로 정렬합니다.",
              "기획-디자인-개발-운영이 동일한 설명을 기반으로 협업할 수 있게 합니다."
            ]
          },
          {
            title: "문제",
            summary: "이 기능이 해결하려는 구체적인 문제를 정의합니다.",
            bullets: [
              `핵심 문제: ${prompt}`,
              "요구사항이 문서별로 분산되면 해석 차이와 재작업이 발생합니다.",
              "정책, 기능, 사용자 흐름, 운영 절차가 분리되면 리뷰와 구현 과정에서 누락이 생길 수 있습니다."
            ]
          },
          {
            title: "왜",
            summary: "이 문제를 해결할 가치가 있다는 근거를 정리합니다.",
            bullets: [
              `${domainType} 도메인에서는 요구사항 명확도와 운영 정합성이 서비스 품질에 직접 영향을 줍니다.`,
              "문제 정의가 정확해지면 개발 우선순위, 운영 기준, QA 범위를 더 빠르게 합의할 수 있습니다.",
              "초기 기획 단계에서 구조화된 문서를 만들면 출시 지연과 커뮤니케이션 비용을 줄일 수 있습니다."
            ]
          },
          {
            title: "성공",
            summary: "문제 해결 여부를 판단할 KPI와 측정 방법을 정의합니다.",
            bullets: [
              "성공 기준 예시: 기획 초안 작성 리드타임 단축",
              "성공 기준 예시: 리뷰 단계의 요구사항 누락 건수 감소",
              "측정 방법: 문서 작성 시간, 수정 반복 횟수, 재작업 건수, 리뷰 피드백 유형을 추적합니다.",
              "품질 기준: PRD와 기능명세서/정책서/유저플로우/흐름도 간 용어와 범위가 상충하지 않아야 합니다."
            ]
          },
          {
            title: "고객",
            summary: "이 기능의 대상 사용자 그룹을 정의합니다.",
            bullets: [
              "주 고객: 서비스 기획자 및 PM/PO",
              "부 고객: 운영자/관리자",
              "협업 이해관계자: 개발 리드, QA 리드, 디자이너",
              "고객 특성: 빠른 초안 작성, 명확한 정책 정의, 구현 가능한 요구사항 문서를 필요로 합니다."
            ]
          },
          {
            title: "무엇",
            summary: "제품에서 이 기능이 어떤 모습으로 제공될지 설명합니다.",
            bullets: [
              "핵심 기능: 프로젝트 생성/불러오기, 문서 순차 생성, 문서별 재생성, 버전/로그 저장",
              "산출물 범위: PRD, 기능명세서, 정책서, 유저플로우, 흐름도차트",
              "운영 요구사항: 권한, 예외 처리, 변경 이력, 검토 근거를 문서에 반영해야 합니다.",
              ...downstreamReferences
            ]
          },
          {
            title: "어떻게",
            summary: "실험 계획과 검증 계획을 정의합니다.",
            bullets: [
              "실험 가설: 구조화된 PRD를 먼저 제시하면 후속 문서의 정합성과 리뷰 속도가 개선됩니다.",
              "검증 방식: 동일 요청에 대해 기존 방식과 개선된 방식의 문서 품질과 리뷰 시간을 비교합니다.",
              "검증 항목: 누락 요구사항 수, 예외 처리 명시 여부, 운영 정책 반영 수준, 이해관계자 피드백",
              "출시 전 점검: 주요 기능, 정책, 흐름, 버전 저장, 다운로드 기능이 정상 동작하는지 확인합니다."
            ]
          },
          {
            title: "언제",
            summary: "주요 마일스톤과 배포 계획을 정리합니다.",
            bullets: [
              "1차 마일스톤: 요구사항 정리 및 PRD 구조 확정",
              "2차 마일스톤: 기능명세/정책서/유저플로우/흐름도 연계 정리",
              "3차 마일스톤: 검증 및 보완, 이해관계자 리뷰 반영",
              "배포 계획: QA 완료 후 단계 배포, 초기 피드백 수집 후 후속 개선 반영"
            ]
          }
        ]);
      case "featureSpec":
        return this.createDocument(
          "feature-spec",
          `${projectName} 기능명세서`,
          generatedAt,
          [
            {
              title: "기능 구조",
              summary: `${currentArtifacts.prd.title}를 기반으로 기능 단위와 주요 책임을 분리합니다.`,
              bullets: [
                "입력 수집, 문서 생성, 버전 관리, 로그 추적 기능을 구분합니다.",
                "실무 구현을 고려한 상태 전이와 예외 처리를 포함합니다.",
                "후속 개선 요청이 문서와 로그에 반영되도록 설계합니다."
              ]
            },
            {
              title: "권한 및 상태",
              summary: "작성자, 검토자, 운영자의 책임을 분리합니다.",
              bullets: ["생성 요청 권한", "문서 확인/비교 권한", "운영 로그 조회 권한"]
            },
            {
              title: "비기능 요구사항",
              summary: "대규모 시스템 대응 품질 기준을 함께 정의합니다.",
              bullets: ["응답 안정성", "버전 추적", "감사 로그", "재생성 가능성"]
            }
          ],
          this.buildFeatureFlowVisualization(projectName)
        );
      case "policySpec":
        return this.createDocument(
          "policy-spec",
          `${projectName} 정책서`,
          generatedAt,
          [
            {
              title: "운영 정책 범위",
              summary: `${currentArtifacts.featureSpec.title}에 맞춰 운영 정책과 승인/예외 규칙을 정리합니다.`,
              bullets: [
                "권한과 승인 정책을 분리합니다.",
                "예외 처리와 로그 기록 정책을 명시합니다.",
                "정책 변경 시 버전 추적이 가능해야 합니다."
              ]
            },
            {
              title: "검토 포인트",
              summary: "정책서는 개발 규칙과 운영 규칙의 공통 기준 문서입니다.",
              bullets: ["권한 매트릭스", "상태 변경 조건", "예외 승인 흐름"]
            },
            {
              title: "감사 및 추적",
              summary: "누가 어떤 규칙을 근거로 변경했는지 추적 가능해야 합니다.",
              bullets: ["감사 로그", "승인 이력", "비고 및 운영 메모"]
            }
          ],
          this.buildPolicyTableVisualization(projectName)
        );
      case "userFlow":
        return this.createDocument(
          "user-flow",
          `${projectName} 유저플로우`,
          generatedAt,
          [
            {
              title: "사용자 여정",
              summary: `${currentArtifacts.policySpec.title}의 정책을 반영한 역할별 여정을 정의합니다.`,
              bullets: ["프로젝트 진입", "문서 생성", "버전 비교", "운영 검토"]
            },
            {
              title: "주요 분기",
              summary: "생성 성공/실패와 추가 보완 요청 흐름을 분리합니다.",
              bullets: ["입력 부족", "품질 보완", "기존 프로젝트 이어쓰기"]
            },
            {
              title: "운영자 관점",
              summary: "일반 사용자 외 운영자가 보는 흐름을 포함합니다.",
              bullets: ["로그 조회", "버전 확인", "정책 재검토"]
            }
          ],
          this.buildUserFlowVisualization()
        );
      case "flowChart":
        return this.createDocument(
          "flow-chart",
          `${projectName} 흐름도차트`,
          generatedAt,
          [
            {
              title: "업무 처리 절차",
              summary: `${currentArtifacts.userFlow.title}를 실제 운영 절차 기준으로 재구성합니다.`,
              bullets: ["요청 접수", "컨텍스트 적재", "문서 생성", "검증", "저장"]
            },
            {
              title: "분기 및 예외",
              summary: "보완 요청과 실패 시 재실행 흐름을 포함합니다.",
              bullets: ["입력 보완", "품질 미달 시 재생성", "운영 승인 후 완료"]
            },
            {
              title: "실무 활용",
              summary: "기획, 개발, 운영이 같은 절차를 기준으로 협업합니다.",
              bullets: ["분기 규칙 검토", "재시도 경로 확인", "운영 인수인계 활용"]
            }
          ],
          this.buildFlowChartVisualization(projectName)
        );
    }
  }

  private buildDomainKnowledgeLayer(domainType: string) {
    const normalized = domainType.trim().toLowerCase();
    const layers: Record<string, string[]> = {
      general: [
        "1계층: 사용자/역할, 핵심 목표, 성공 지표",
        "2계층: 주요 기능, 상태 전이, 권한 정책",
        "3계층: 예외 처리, 운영 정책, 로그/감사, 외부 연동"
      ],
      commerce: [
        "1계층: 상품, 고객, 장바구니, 주문, 결제",
        "2계층: 재고, 배송, 쿠폰/프로모션, 반품/환불",
        "3계층: 정산, CS, 사기탐지, 운영 배치, 로그/감사"
      ],
      erp: [
        "1계층: 기준정보, 조직/권한, 거래처, 품목",
        "2계층: 구매, 판매, 재고, 생산, 회계",
        "3계층: 승인 워크플로우, 마감/정산, 전표, 감사 추적, 마스터 동기화"
      ],
      groupware: [
        "1계층: 사용자, 조직도, 업무공간, 권한",
        "2계층: 메일, 캘린더, 결재, 게시판, 협업 문서",
        "3계층: 알림, 검색, 보존 정책, 감사 로그, 외부 연동"
      ],
      mes: [
        "1계층: 공장, 라인, 설비, 작업자, 품목",
        "2계층: 작업지시, 공정, 실적, 불량, 재공",
        "3계층: 추적성, 품질 검사, 설비 인터락, 생산 리포트, ERP 연동"
      ],
      finance: [
        "1계층: 고객, 계좌, 상품, 거래",
        "2계층: 승인, 한도, 정산, 수수료, 심사",
        "3계층: 이상거래 탐지, 규제 준수, 감사 로그, 배치 마감, 대외 연계"
      ],
      healthcare: [
        "1계층: 환자, 의료진, 기관, 예약, 진료",
        "2계층: 처방, 수납, 보험, 검사, 기록",
        "3계층: 개인정보 보호, 접근권한, 감사 추적, 법규 준수, 외부 시스템 연동"
      ],
      logistics: [
        "1계층: 화주, 주문, 창고, 차량, 기사",
        "2계층: 입고, 출고, 배차, 배송 추적, 정산",
        "3계층: SLA, 예외 배송, 라우팅 최적화, 클레임, 운영 모니터링"
      ],
      edtech: [
        "1계층: 학습자, 강사, 과정, 콘텐츠, 평가",
        "2계층: 수강신청, 진도, 과제, 시험, 결제",
        "3계층: 학습 분석, 알림, 인증/부정행위 방지, 운영 리포트, 외부 LMS 연동"
      ]
    };

    const resolved = layers[normalized] ?? [
      `1계층: ${domainType} 도메인의 핵심 사용자, 엔터티, 목표`,
      `2계층: ${domainType} 도메인의 주요 기능, 정책, 상태 전이`,
      `3계층: ${domainType} 도메인의 예외 처리, 운영 절차, 로그/감사, 외부 연동`
    ];

    return resolved.map((line) => `- ${line}`).join("\n");
  }

  private createDocument(
    kind: ArtifactDocument["kind"],
    title: string,
    generatedAt: string,
    sections: ArtifactSection[],
    visualization?: ArtifactDocument["visualization"]
  ): ArtifactDocument {
    return {
      kind,
      title,
      version: "draft",
      generatedAt,
      sections,
      visualization
    };
  }

  private buildFeatureFlowVisualization(projectName: string): FeatureFlowVisualization {
    return {
      type: "feature-flow",
      rootNodeId: "root",
      nodes: [
        { id: "root", label: `${projectName} 요청 입력`, description: "프로젝트 개선 요청을 접수합니다.", column: 0, accent: "primary" },
        { id: "context", label: "프로젝트 컨텍스트 적재", description: "이전 로그와 문서를 불러옵니다.", column: 1, accent: "secondary" },
        { id: "prd", label: "PRD 정렬", description: "목표, 범위, KPI를 재정렬합니다.", column: 2, accent: "neutral" },
        { id: "feature", label: "기능명세 보강", description: "기능, 상태, 예외 처리를 상세화합니다.", column: 3, accent: "primary" },
        { id: "policy", label: "정책 검증", description: "권한, 승인, 예외 규칙을 연결합니다.", column: 3, accent: "secondary" },
        { id: "flow", label: "사용자/업무 흐름 동기화", description: "유저플로우와 흐름도를 재정렬합니다.", column: 4, accent: "secondary" },
        { id: "version", label: "버전 저장", description: "프로젝트 로그와 문서 버전을 저장합니다.", column: 5, accent: "neutral" }
      ],
      edges: [
        { from: "root", to: "context", label: "요청" },
        { from: "context", to: "prd", label: "정리" },
        { from: "prd", to: "feature", label: "상세화" },
        { from: "prd", to: "policy", label: "정책 추출" },
        { from: "feature", to: "flow", label: "구조화" },
        { from: "policy", to: "flow", label: "검증" },
        { from: "flow", to: "version", label: "저장" }
      ]
    };
  }

  private buildPolicyTableVisualization(projectName: string): PolicyTableVisualization {
    return {
      type: "policy-table",
      title: `${projectName} 정책 정의서`,
      columns: [
        { key: "policyCode", label: "정책 코드" },
        { key: "policyName", label: "정책명" },
        { key: "target", label: "적용 대상" },
        { key: "condition", label: "조건" },
        { key: "rule", label: "정책 정의" },
        { key: "approval", label: "승인/예외" },
        { key: "note", label: "비고" }
      ],
      rows: [
        {
          id: "policy-01",
          values: {
            policyCode: "gen-01",
            policyName: "프로젝트 생성 정책",
            target: "기획자",
            condition: "새 요청 생성 시",
            rule: "프로젝트 컨텍스트와 최근 로그를 함께 적재한다.",
            approval: "운영자 검토 가능",
            note: "프로젝트 단위로 누적 저장"
          }
        },
        {
          id: "policy-02",
          values: {
            policyCode: "gen-02",
            policyName: "문서 재생성 정책",
            target: "기획자/운영자",
            condition: "특정 문서만 보강할 때",
            rule: "선행 문서는 유지하고 대상 문서부터 하위 문서를 재생성한다.",
            approval: "예외 시 수동 재실행",
            note: "버전과 변경 근거 로그 저장"
          }
        }
      ]
    };
  }

  private buildUserFlowVisualization(): TreeMapVisualization {
    return {
      type: "tree-map",
      title: "프로젝트 기반 유저플로우",
      root: {
        id: "root",
        label: "프로젝트 선택",
        description: "새 프로젝트를 만들거나 기존 프로젝트를 불러옵니다.",
        accent: "neutral",
        children: [
          {
            id: "project-new",
            label: "새 프로젝트",
            accent: "primary",
            children: [
              { id: "project-new-name", label: "프로젝트명 입력" },
              { id: "project-new-create", label: "빈 컨텍스트 생성", accent: "secondary" }
            ]
          },
          {
            id: "project-load",
            label: "기존 프로젝트 불러오기",
            accent: "primary",
            children: [
              { id: "project-load-log", label: "프로젝트 로그 조회" },
              { id: "project-load-artifact", label: "최신 문서 버전 열기" },
              { id: "project-load-improve", label: "추가 요청으로 개선", accent: "secondary" }
            ]
          }
        ]
      }
    };
  }

  private buildFlowChartVisualization(projectName: string): FlowChartVisualization {
    return {
      type: "flow-chart",
      title: `${projectName} 개선 흐름도`,
      nodes: [
        { id: "start", label: "프로젝트 선택", description: "새 프로젝트 또는 기존 프로젝트를 선택합니다.", column: 1, row: 0, shape: "terminator", accent: "neutral" },
        { id: "load", label: "컨텍스트 적재", description: "최신 문서와 로그를 불러옵니다.", column: 1, row: 1, shape: "process", accent: "secondary" },
        { id: "check", label: "요청 충분성 검토", description: "추가 요청 내용이 충분한지 검토합니다.", column: 1, row: 2, shape: "decision", accent: "primary" },
        { id: "guide", label: "보완 질문 제시", description: "입력이 부족하면 질문을 제시합니다.", column: 2, row: 2, shape: "document", accent: "secondary" },
        { id: "generate", label: "문서 순차 생성", description: "PRD부터 흐름도차트까지 순차적으로 갱신합니다.", column: 1, row: 3, shape: "subprocess", accent: "primary" },
        { id: "review", label: "품질 체크", description: "누락 항목과 정합성을 점검합니다.", column: 1, row: 4, shape: "decision", accent: "primary" },
        { id: "retry", label: "문서별 재생성", description: "필요한 문서부터 재생성합니다.", column: 2, row: 4, shape: "process", accent: "secondary" },
        { id: "store", label: "프로젝트 로그 저장", description: "세션 로그와 버전을 저장합니다.", column: 1, row: 5, shape: "process", accent: "neutral" },
        { id: "finish", label: "검토 완료", description: "프로젝트 개선 결과를 확인합니다.", column: 1, row: 6, shape: "terminator", accent: "neutral" }
      ],
      edges: [
        { from: "start", to: "load" },
        { from: "load", to: "check" },
        { from: "check", to: "generate", label: "YES" },
        { from: "check", to: "guide", label: "NO" },
        { from: "guide", to: "check", label: "재입력" },
        { from: "generate", to: "review" },
        { from: "review", to: "store", label: "적합" },
        { from: "review", to: "retry", label: "보완 필요" },
        { from: "retry", to: "generate", label: "재실행" },
        { from: "store", to: "finish" }
      ]
    };
  }
}

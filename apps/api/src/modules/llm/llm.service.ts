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

const artifactOrder: ArtifactKey[] = ["prd", "featureSpec", "policySpec", "userFlow", "flowChart"];

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
        contextSummary: input.contextSummary,
        recentLogs: input.recentLogs,
        currentArtifacts: workingArtifacts
      });

      workingArtifacts[artifactKey] = generatedDocument;
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
    contextSummary: string;
    recentLogs: GenerationLogItem[];
    currentArtifacts: WorkspaceArtifactSet;
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
      input.currentArtifacts
    );
  }

  private async requestStageOutput(input: {
    artifactKey: ArtifactKey;
    generatedAt: string;
    projectName: string;
    domainType: string;
    prompt: string;
    contextSummary: string;
    recentLogs: GenerationLogItem[];
    currentArtifacts: WorkspaceArtifactSet;
  }): Promise<StageOutput | null> {
    const apiKey = this.configService.get<string>("LLM_API_KEY");
    const baseUrl = this.configService.get<string>("LLM_BASE_URL");
    const model = this.configService.get<string>("LLM_MODEL") ?? "gpt-4.1-mini";

    if (!apiKey || !baseUrl) {
      return null;
    }

    try {
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
              content: this.buildStagePrompt(input)
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

  private buildStagePrompt(input: {
    artifactKey: ArtifactKey;
    generatedAt: string;
    projectName: string;
    domainType: string;
    prompt: string;
    contextSummary: string;
    recentLogs: GenerationLogItem[];
    currentArtifacts: WorkspaceArtifactSet;
  }) {
    const previousArtifacts = artifactOrder
      .slice(0, artifactOrder.indexOf(input.artifactKey))
      .filter((artifactKey) => this.isGeneratedDocument(input.currentArtifacts[artifactKey]))
      .map((artifactKey) => this.summarizeDocument(input.currentArtifacts[artifactKey]))
      .join("\n\n");

    const recentLogs = input.recentLogs
      .slice(0, 5)
      .map((log) => `- ${log.createdAt}: ${log.summary}`)
      .join("\n");

    const domainKnowledgeLayer = this.buildDomainKnowledgeLayer(input.domainType);

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
      `누적 컨텍스트 요약: ${input.contextSummary}`,
      recentLogs ? `최근 생성 로그:\n${recentLogs}` : "최근 생성 로그: 없음",
      previousArtifacts ? `이전 단계 산출물 요약:\n${previousArtifacts}` : "이전 단계 산출물 요약: 없음",
      `이번에 생성할 대상: ${input.artifactKey}`,
      `generatedAt에는 ${input.generatedAt}를 사용해`
    ].join("\n\n");
  }

  private getStageSchema(artifactKey: ArtifactKey) {
    switch (artifactKey) {
      case "prd":
        return [
          'document.kind는 "prd"다.',
          'visualization은 포함하지 않아도 된다.',
          "PRD에는 최소한 제품 목표, 핵심 사용자, KPI, 범위/제약조건을 포함한다."
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
    }
  }

  private getStageQualityRules(artifactKey: ArtifactKey) {
    const commonRules = [
      "문서 간 용어를 일관되게 유지한다.",
      "애매한 표현 대신 구현 가능한 수준의 정책/흐름/예외를 적는다.",
      "실무 검토에 필요한 누락 항목이 없도록 작성한다."
    ];

    const stageRules: Record<ArtifactKey, string[]> = {
      prd: ["목표, 범위, 핵심 사용자, KPI, 제약조건을 분리한다."],
      featureSpec: ["기능별 흐름과 시스템 책임, 예외 처리, 비기능 요구사항을 분리한다."],
      policySpec: ["권한, 승인, 예외, 조건, 로그 관점을 테이블에 반영한다."],
      userFlow: ["메뉴 구조뿐 아니라 사용자 역할별 주요 경로를 포함한다."],
      flowChart: ["업무 절차, 분기, 실패, 재시도, 완료 경로를 반드시 표현한다."]
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
      flowChart: this.buildQualityChecklist("flowChart", artifacts.flowChart)
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
        return [...base, "목표/KPI/범위/제약 조건을 분리했는지 확인"];
      case "featureSpec":
        return [...base, "기능 플로우, 예외 처리, 비기능 요구사항을 포함했는지 확인"];
      case "policySpec":
        return [...base, "정책 컬럼 구조와 권한/예외 조건이 충분한지 확인"];
      case "userFlow":
        return [...base, "역할별 진입점과 depth 구조가 표현되었는지 확인"];
      case "flowChart":
        return [...base, "분기, 재처리, 종료 흐름이 연결되었는지 확인"];
    }
  }

  private buildSuggestedActions(artifacts: WorkspaceArtifactSet, prompt: string, domainType: string): string[] {
    return [
      `${domainType} 도메인 기준으로 핵심 엔터티와 상태 전이를 더 구체화해줘`,
      `이 요청에서 놓친 운영 정책을 ${artifacts.policySpec.title} 기준으로 보강해줘`,
      `${artifacts.userFlow.title}를 관리자/운영자 관점으로 확장해줘`,
      `${prompt.slice(0, 48)} 관련 예외 흐름과 실패 처리 시나리오를 추가해줘`
    ];
  }

  private buildContextSummary(projectName: string, prompt: string, artifacts: WorkspaceArtifactSet, domainType: string) {
    return [
      `${projectName} 프로젝트는 ${domainType} 도메인 기준의 지식 계층과 최신 요청 "${prompt}"를 반영해 문서를 갱신했습니다.`,
      `현재 PRD는 ${artifacts.prd.sections[0]?.title ?? "목표"}를 기준으로 범위를 정의합니다.`,
      `기능명세와 정책서는 구현/운영 규칙을 분리했고, 유저플로우와 흐름도는 이를 사용자/업무 절차 관점으로 연결합니다.`
    ].join(" ");
  }

  private summarizeDocument(document: ArtifactDocument) {
    return [
      `${document.title} (${document.kind})`,
      ...document.sections.map((section) => `- ${section.title}: ${section.summary}`)
    ].join("\n");
  }

  private buildTemplateDocument(
    artifactKey: ArtifactKey,
    projectName: string,
    domainType: string,
    prompt: string,
    generatedAt: string,
    currentArtifacts: WorkspaceArtifactSet
  ): ArtifactDocument {
    switch (artifactKey) {
      case "prd":
        return this.createDocument("prd", `${projectName} PRD`, generatedAt, [
          {
            title: "제품 목표",
            summary: `${projectName} 프로젝트는 ${domainType} 도메인 관점을 반영해 ${prompt} 요청을 해결하기 위한 실무형 기획 산출물을 제공합니다.`,
            bullets: [
              `핵심 문제: ${prompt}`,
              `도메인 기준: ${domainType} 도메인의 핵심 업무 흐름과 데이터 구조를 반영합니다.`,
              "대규모 시스템에서도 재사용 가능한 문서 구조를 표준화합니다.",
              "기획-디자인-개발-운영이 동일한 기준 문서를 공유합니다."
            ]
          },
          {
            title: "주요 사용자 및 이해관계자",
            summary: "실제 운영 조직 기준으로 문서 소비자와 사용자 집단을 구분합니다.",
            bullets: ["PM/PO", "서비스기획자", "운영자/관리자", "개발/QA 리드"]
          },
          {
            title: "핵심 지표 및 제약",
            summary: "성과 지표와 제약조건을 함께 정의합니다.",
            bullets: ["처리 시간, 성공률, 재사용률", "권한/예외/로그 추적 필요", "대규모 운영 대응성 확보"]
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

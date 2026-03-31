import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ArtifactDocument,
  ArtifactSection,
  FeatureFlowVisualization,
  FlowChartVisualization,
  PolicyTableVisualization,
  TreeMapVisualization,
  WorkspaceArtifactSet
} from "@mottor-plan/shared";

interface LlmOutput {
  artifacts: WorkspaceArtifactSet;
  suggestedActions: string[];
}

@Injectable()
export class LlmService {
  constructor(private readonly configService: ConfigService) {}

  async generateArtifacts(workspaceName: string, prompt: string): Promise<LlmOutput> {
    const apiKey = this.configService.get<string>("LLM_API_KEY");
    const baseUrl = this.configService.get<string>("LLM_BASE_URL");
    const model = this.configService.get<string>("LLM_MODEL") ?? "gpt-4.1-mini";

    if (apiKey && baseUrl) {
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            temperature: 0.5,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "너는 B2B SaaS 제품기획 전문가다. 입력 아이디어를 바탕으로 PRD, 기능명세서, 정책서, 유저플로우, 흐름도차트를 한국어 JSON으로 생성한다. 기능명세서에는 좌측에서 우측으로 확장되는 기능 플로우 그래프를, 정책서에는 동적 컬럼 테이블을, 유저플로우에는 left-to-right tree 기반 메뉴 구조도를, 흐름도차트에는 상단에서 하단으로 흐르는 수직형 flow chart를 반드시 포함한다."
              },
              {
                role: "user",
                content: [
                  "다음 형식으로만 응답해.",
                  '{ "artifacts": { "prd": {...}, "featureSpec": {...}, "policySpec": {...}, "userFlow": {...}, "flowChart": {...} }, "suggestedActions": ["", "", ""] }',
                  '각 문서는 title, version, generatedAt, sections, visualization을 포함한다.',
                  'sections는 [{ "title": "", "summary": "", "bullets": ["", ""] }] 구조다.',
                  'featureSpec.visualization은 반드시 { "type": "feature-flow", "rootNodeId": "", "nodes": [{ "id": "", "label": "", "description": "", "column": 0, "accent": "primary|secondary|neutral" }], "edges": [{ "from": "", "to": "", "label": "" }] } 구조를 따른다.',
                  'policySpec.visualization은 반드시 { "type": "policy-table", "title": "", "columns": [{ "key": "", "label": "" }], "rows": [{ "id": "", "values": { "columnKey": "cellValue" } }] } 구조를 따른다.',
                  'userFlow.visualization은 반드시 { "type": "tree-map", "title": "", "root": { "id": "", "label": "", "description": "", "accent": "primary|secondary|neutral", "children": [] } } 구조를 따른다.',
                  'flowChart.visualization은 반드시 { "type": "flow-chart", "title": "", "nodes": [{ "id": "", "label": "", "description": "", "column": 0, "row": 0, "shape": "terminator|process|decision|document|subprocess", "accent": "primary|secondary|neutral" }], "edges": [{ "from": "", "to": "", "label": "" }] } 구조를 따른다.',
                  "featureSpec 그래프는 필요한 만큼 column과 node를 사용해 좌->우 흐름이 보이도록 만든다.",
                  "policySpec 테이블은 요구사항에 맞춰 열 개수와 열 이름을 유연하게 생성한다. 예: 정책코드, 정책명, 사용자, 보기, 수정, 삭제, 조건, 비고 등.",
                  "policySpec 각 row는 columns의 key를 기준으로 모든 셀 값을 values 객체에 채운다.",
                  "userFlow tree는 depth 제한 없이 children을 중첩할 수 있어야 하며, 같은 depth에 여러 형제 노드가 있을 수 있다.",
                  "메뉴 구조도는 root에서 시작해 좌우로 뻗고, 동일 레벨 항목은 아래로 쌓이는 형태로 설계한다.",
                  "flowChart는 유저플로우와 다르게 실제 업무 흐름도를 표현해야 하며, 조건 분기에는 decision shape를 사용한다.",
                  "flowChart는 기본적으로 위에서 아래로 진행되는 수직 흐름이어야 하며, row는 상단에서 하단으로 이어지는 단계 순서를 의미한다.",
                  "flowChart의 column은 메인 수직 축에서 좌우로 분기되는 보조 레인을 의미한다. 메인 흐름은 가능하면 같은 column에 세로로 배치한다.",
                  "document shape는 안내/입력/출력 단계처럼 보조 화면이나 입출력 단계에 사용한다.",
                  `워크스페이스명: ${workspaceName}`,
                  `사용자 요청: ${prompt}`
                ].join("\n")
              }
            ]
          })
        });

        if (response.ok) {
          const payload = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const content = payload.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content) as LlmOutput;
            return parsed;
          }
        }
      } catch {
        // 외부 LLM 실패 시 템플릿 결과로 폴백합니다.
      }
    }

    return this.buildTemplateArtifacts(workspaceName, prompt);
  }

  private buildTemplateArtifacts(workspaceName: string, prompt: string): LlmOutput {
    const baseSections = this.buildSections(workspaceName, prompt);
    const generatedAt = new Date().toISOString();

    return {
      artifacts: {
        prd: this.createDocument("prd", `${workspaceName} PRD`, generatedAt, baseSections.prd),
        featureSpec: this.createDocument(
          "feature-spec",
          `${workspaceName} 기능명세서`,
          generatedAt,
          baseSections.featureSpec,
          this.buildFeatureFlowVisualization(workspaceName)
        ),
        policySpec: this.createDocument(
          "policy-spec",
          `${workspaceName} 정책서`,
          generatedAt,
          baseSections.policySpec,
          this.buildPolicyTableVisualization(workspaceName)
        ),
        userFlow: this.createDocument(
          "user-flow",
          `${workspaceName} 유저플로우`,
          generatedAt,
          baseSections.userFlow,
          this.buildUserFlowVisualization()
        ),
        flowChart: this.createDocument(
          "flow-chart",
          `${workspaceName} 흐름도차트`,
          generatedAt,
          baseSections.flowChart,
          this.buildFlowChartVisualization(workspaceName)
        )
      },
      suggestedActions: [
        "관리자 백오피스 요구사항을 추가해줘",
        "운영 정책과 예외 케이스를 보강해줘",
        "릴리즈 범위를 MVP와 Phase 2로 나눠줘"
      ]
    };
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
      version: "v1.0",
      generatedAt,
      sections,
      visualization
    };
  }

  private buildFeatureFlowVisualization(workspaceName: string): FeatureFlowVisualization {
    return {
      type: "feature-flow",
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          label: `${workspaceName} 기획 생성`,
          description: "한 줄 아이디어를 입력하고 산출물 생성 세션을 시작합니다.",
          column: 0,
          accent: "primary"
        },
        {
          id: "analyze",
          label: "요청 분석",
          description: "핵심 목적, 대상 사용자, 제약조건을 분해합니다.",
          column: 1,
          accent: "secondary"
        },
        {
          id: "standardize",
          label: "문서 구조 표준화",
          description: "PRD, 기능명세서, 유저플로우 공통 용어와 필드를 정렬합니다.",
          column: 1,
          accent: "secondary"
        },
        {
          id: "prd",
          label: "PRD 초안 생성",
          description: "제품 목표, 범위, KPI를 산출합니다.",
          column: 2,
          accent: "neutral"
        },
        {
          id: "feature",
          label: "기능명세 생성",
          description: "핵심 기능과 예외 정책을 구체화합니다.",
          column: 2,
          accent: "primary"
        },
        {
          id: "user-flow",
          label: "유저플로우 생성",
          description: "IA 및 주요 사용자 여정을 구조화합니다.",
          column: 2,
          accent: "secondary"
        },
        {
          id: "history",
          label: "히스토리 저장",
          description: "생성 세션과 결과물을 Supabase에 저장합니다.",
          column: 3,
          accent: "neutral"
        },
        {
          id: "export",
          label: "다운로드 제공",
          description: "PNG, PDF, Markdown 형식으로 내보냅니다.",
          column: 3,
          accent: "primary"
        },
        {
          id: "reuse",
          label: "재생성 및 재사용",
          description: "이전 히스토리를 기반으로 후속 기획을 이어갑니다.",
          column: 4,
          accent: "secondary"
        }
      ],
      edges: [
        { from: "root", to: "analyze", label: "입력" },
        { from: "root", to: "standardize", label: "정규화" },
        { from: "analyze", to: "prd", label: "산출" },
        { from: "standardize", to: "feature", label: "정의" },
        { from: "standardize", to: "user-flow", label: "구조화" },
        { from: "prd", to: "history", label: "저장" },
        { from: "feature", to: "export", label: "내보내기" },
        { from: "user-flow", to: "export", label: "시각화" },
        { from: "history", to: "reuse", label: "재사용" },
        { from: "export", to: "reuse", label: "공유" }
      ]
    };
  }

  private buildUserFlowVisualization(): TreeMapVisualization {
    return {
      type: "tree-map",
      title: "사용자 여정 및 IA 구조",
      root: {
        id: "root",
        label: "서비스 시작",
        description: "사용자가 서비스에 진입한 뒤 목적에 따라 메뉴를 확장합니다.",
        accent: "neutral",
        children: [
          {
            id: "auth",
            label: "인증",
            accent: "primary",
            children: [
              { id: "auth-login", label: "로그인", accent: "primary" },
              { id: "auth-signup", label: "회원가입" },
              { id: "auth-password", label: "비밀번호 찾기" }
            ]
          },
          {
            id: "workspace",
            label: "대시보드",
            accent: "primary",
            children: [
              {
                id: "generate",
                label: "문서 생성",
                children: [
                  { id: "generate-request", label: "요청 입력" },
                  { id: "generate-preview", label: "산출물 미리보기" },
                  { id: "generate-run", label: "문서 생성 실행", accent: "secondary" }
                ]
              },
              {
                id: "history",
                label: "히스토리",
                children: [
                  { id: "history-list", label: "생성 히스토리 조회" },
                  { id: "history-detail", label: "문서 상세 보기" },
                  { id: "history-download", label: "다운로드" }
                ]
              },
              {
                id: "setting",
                label: "설정",
                accent: "secondary",
                children: [
                  { id: "setting-template", label: "출력 템플릿 설정" },
                  { id: "setting-provider", label: "LLM Provider 설정" },
                  { id: "setting-profile", label: "프로필 수정" },
                  { id: "setting-logout", label: "로그아웃" }
                ]
              }
            ]
          }
        ]
      }
    };
  }

  private buildFlowChartVisualization(workspaceName: string): FlowChartVisualization {
    return {
      type: "flow-chart",
      title: `${workspaceName} 업무 흐름도`,
      nodes: [
        {
          id: "start",
          label: "요청 접수",
          description: "사용자가 아이디어와 요구사항을 입력합니다.",
          column: 1,
          row: 0,
          shape: "terminator",
          accent: "neutral"
        },
        {
          id: "validate",
          label: "입력 조건 확인",
          description: "입력 길이, 필수 정보, 제약조건 포함 여부를 검사합니다.",
          column: 1,
          row: 1,
          shape: "decision",
          accent: "primary"
        },
        {
          id: "guide",
          label: "보완 질문 제안",
          description: "입력이 부족하면 예시와 보완 질문을 제시합니다.",
          column: 2,
          row: 1,
          shape: "document",
          accent: "secondary"
        },
        {
          id: "normalize",
          label: "요청 정규화",
          description: "도메인, 사용자, 정책, 산출물 타입을 정리합니다.",
          column: 1,
          row: 2,
          shape: "process",
          accent: "secondary"
        },
        {
          id: "generate",
          label: "산출물 생성 엔진 실행",
          description: "PRD, 기능명세서, 정책서, 유저플로우, 흐름도를 생성합니다.",
          column: 1,
          row: 3,
          shape: "subprocess",
          accent: "primary"
        },
        {
          id: "review",
          label: "결과 품질 점검",
          description: "구조 누락 여부와 핵심 섹션 충족 여부를 검토합니다.",
          column: 1,
          row: 4,
          shape: "decision",
          accent: "primary"
        },
        {
          id: "retry",
          label: "재생성 또는 수정",
          description: "누락 시 프롬프트를 보강하고 다시 생성합니다.",
          column: 2,
          row: 4,
          shape: "process",
          accent: "secondary"
        },
        {
          id: "store",
          label: "세션 저장",
          description: "Supabase에 세션과 문서를 저장합니다.",
          column: 1,
          row: 5,
          shape: "process",
          accent: "neutral"
        },
        {
          id: "end",
          label: "다운로드 및 공유",
          description: "검토 완료 후 문서를 내보내고 공유합니다.",
          column: 1,
          row: 6,
          shape: "terminator",
          accent: "neutral"
        }
      ],
      edges: [
        { from: "start", to: "validate" },
        { from: "validate", to: "normalize", label: "YES" },
        { from: "validate", to: "guide", label: "NO" },
        { from: "guide", to: "validate", label: "재입력" },
        { from: "normalize", to: "generate" },
        { from: "generate", to: "review" },
        { from: "review", to: "store", label: "적합" },
        { from: "review", to: "retry", label: "보완 필요" },
        { from: "retry", to: "generate", label: "재실행" },
        { from: "store", to: "end" }
      ]
    };
  }

  private buildPolicyTableVisualization(workspaceName: string): PolicyTableVisualization {
    return {
      type: "policy-table",
      title: `${workspaceName} 정책 정의서`,
      columns: [
        { key: "policyCode", label: "정책 코드" },
        { key: "policyName", label: "정책명" },
        { key: "detail", label: "세부 항목" },
        { key: "target", label: "적용 대상" },
        { key: "rule", label: "정책 정의" },
        { key: "note", label: "비고" }
      ],
      rows: [
        {
          id: "policy-auth-01",
          values: {
            policyCode: "auth-01",
            policyName: "로그인 정책",
            detail: "비밀번호 재시도",
            target: "비회원/회원",
            rule: "5회 이상 실패 시 10분간 로그인 제한",
            note: "보안 이벤트 로그 기록"
          }
        },
        {
          id: "policy-booking-01",
          values: {
            policyCode: "booking-01",
            policyName: "예약 정책",
            detail: "동시 예약 충돌",
            target: "일반 사용자",
            rule: "동일 자원, 동일 시간대에는 선점 요청만 예약 성공 처리",
            note: "실패 시 대체 시간 제안"
          }
        },
        {
          id: "policy-notice-01",
          values: {
            policyCode: "notice-01",
            policyName: "알림 정책",
            detail: "예약 변경 알림",
            target: "예약자/운영자",
            rule: "예약 생성, 변경, 취소 시 앱 알림과 이메일을 발송",
            note: "사용자 설정에 따라 채널 제어"
          }
        }
      ]
    };
  }

  private buildSections(workspaceName: string, prompt: string) {
    return {
      prd: [
        {
          title: "제품 비전",
          summary: `${workspaceName}는 아이디어 입력만으로 실무형 산출물을 생성하는 AI 기획 워크스페이스입니다.`,
          bullets: [
            `핵심 문제: ${prompt}`,
            "기획자와 디자이너, 개발자의 초기 정렬 시간을 줄입니다.",
            "기업용 서비스 수준의 재사용성과 문서 표준화를 목표로 합니다."
          ]
        },
        {
          title: "주요 사용자",
          summary: "실무 조직에서 문서 생산성과 품질 표준화가 필요한 역할을 대상으로 합니다.",
          bullets: [
            "PM/PO: 요구사항 정의 및 범위 관리",
            "서비스기획자: 기능 상세화 및 정책 설계",
            "디자인/개발 리드: 협업용 기준 문서 확보"
          ]
        },
        {
          title: "핵심 성공지표",
          summary: "생성 품질과 협업 효율을 기준으로 운영 지표를 설계합니다.",
          bullets: [
            "문서 생성 완료율 95% 이상",
            "재생성 포함 평균 생성 시간 60초 이내",
            "다운로드 및 재활용 전환율 40% 이상"
          ]
        }
      ],
      featureSpec: [
        {
          title: "핵심 기능",
          summary: "사용자 화면과 운영 관점에서 필수 기능을 정의합니다.",
          bullets: [
            "좌측 LLM 챗 입력 패널과 프롬프트 보완 가이드",
            "우측 탭 기반 산출물 캔버스(PRD, 기능명세서, 유저플로우)",
            "PNG/PDF/Markdown 다운로드 및 생성 히스토리 조회"
          ]
        },
        {
          title: "시스템 요구사항",
          summary: "중견기업 이상 환경을 고려한 운영 안정성과 확장성을 포함합니다.",
          bullets: [
            "세션/문서/다운로드 이력 저장",
            "LLM provider 추상화와 장애 폴백 구조",
            "권한/감사로그/버전관리 확장 가능 구조"
          ]
        },
        {
          title: "비기능 요구사항",
          summary: "운영 품질을 보장하는 기준을 함께 정의합니다.",
          bullets: [
            "API 레이어에서 입력 검증과 예외 응답 표준화",
            "Supabase PostgreSQL 기반 영속화",
            "모노레포 기반 CI/CD와 서비스 분리 배포 대응"
          ]
        }
      ],
      policySpec: [
        {
          title: "정책 정의 범위",
          summary: "기능 구현 이전에 서비스 운영 정책과 권한/예외 규칙을 구조화합니다.",
          bullets: [
            "인증, 예약, 결제, 알림, 게시판 등 정책 단위를 분리해 정의합니다.",
            "테이블 컬럼은 도메인에 맞게 AI가 유연하게 추가/변경할 수 있습니다.",
            "정책 코드는 운영/개발/QA가 공통으로 참조할 수 있도록 식별자로 관리합니다."
          ]
        },
        {
          title: "활용 목적",
          summary: "정책서는 화면 명세와 별개로 운영 규칙과 권한 규칙을 문서화하는 기준 문서입니다.",
          bullets: [
            "예외 처리와 권한 차이를 명확히 정의합니다.",
            "기획 변경 시 정책 단위 diff와 이력 관리를 쉽게 합니다.",
            "백엔드 검증 규칙과 관리자 운영 정책 수립에 활용합니다."
          ]
        }
      ],
      userFlow: [
        {
          title: "사용자 메인 여정",
          summary: "사용자는 아이디어 한 줄 입력 후 산출물을 생성하고 저장합니다.",
          bullets: [
            "아이디어 입력 -> 생성 요청 -> 문서 응답 렌더링",
            "문서 탭 전환 -> 검토 -> 다운로드",
            "히스토리 열기 -> 과거 세션 탐색 -> 재사용"
          ]
        },
        {
          title: "예외 처리 플로우",
          summary: "실무형 서비스에 필요한 실패 대응 플로우를 정의합니다.",
          bullets: [
            "입력 부족 시 추가 질문 또는 예시 입력 제안",
            "LLM 오류 시 템플릿 기반 초안 생성",
            "DB 저장 실패 시 메모리 캐시로 임시 보존"
          ]
        },
        {
          title: "운영자 플로우",
          summary: "서비스 운영 관점에서 모니터링과 이력 관리 흐름을 확보합니다.",
          bullets: [
            "생성 세션 상태 확인",
            "문서 다운로드 현황 조회",
            "장애 발생 시 재시도 및 로그 분석"
          ]
        }
      ],
      flowChart: [
        {
          title: "업무 흐름 기준",
          summary: "흐름도차트는 메뉴 구조도가 아니라 실제 처리 절차와 분기 규칙을 표현합니다.",
          bullets: [
            "시작/종료, 처리, 문서, 분기 노드를 분리해 표현합니다.",
            "조건 분기에는 decision 노드를 사용하고 edge label로 YES/NO를 표기합니다.",
            "좌->우 진행을 기본으로 하되 예외 처리와 재시도는 상하 분기로 표현합니다."
          ]
        },
        {
          title: "활용 목적",
          summary: "운영자, 기획자, 개발자가 동일한 실행 흐름을 기준으로 협업하도록 돕습니다.",
          bullets: [
            "화면 중심이 아닌 업무 프로세스 중심으로 단계별 책임을 명확히 합니다.",
            "예외 처리, 검토, 재시도 루프를 시각적으로 확인할 수 있습니다.",
            "정책서 및 기능명세서의 세부 규칙을 실행 흐름으로 연결합니다."
          ]
        }
      ]
    };
  }
}

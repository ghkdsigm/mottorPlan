import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ArtifactDocument, ArtifactSection, WorkspaceArtifactSet } from "@mottor-plan/shared";

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
                  "너는 B2B SaaS 제품기획 전문가다. 입력 아이디어를 바탕으로 PRD, 기능명세서, 유저플로우를 한국어 JSON으로 생성한다."
              },
              {
                role: "user",
                content: [
                  "다음 형식으로만 응답해.",
                  '{ "artifacts": { "prd": {...}, "featureSpec": {...}, "userFlow": {...} }, "suggestedActions": ["", "", ""] }',
                  '각 문서는 title, version, generatedAt, sections를 포함하고, sections는 [{ "title": "", "summary": "", "bullets": ["", ""] }] 구조다.',
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
          baseSections.featureSpec
        ),
        userFlow: this.createDocument(
          "user-flow",
          `${workspaceName} 유저플로우`,
          generatedAt,
          baseSections.userFlow
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
    sections: ArtifactSection[]
  ): ArtifactDocument {
    return {
      kind,
      title,
      version: "v1.0",
      generatedAt,
      sections
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
      ]
    };
  }
}

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import JSZip from "jszip";
import {
  DOMAIN_PRESET_OPTIONS,
  type DomainPreset,
  type ArtifactDocument,
  type ArtifactKey,
  type ArtifactVersionSummary,
  type FeatureFlowVisualization,
  type FlowChartVisualization,
  type GenerationResponse,
  type GenerationLogItem,
  type PolicyTableVisualization,
  type ProjectDetail,
  type ProjectSummary,
  type ScreenSpecInput,
  type ScreenSpecVisualization,
  type TreeMapNode,
  type TreeMapVisualization,
  type WorkspaceArtifactSet
} from "@mottor-plan/shared";
import { api } from "./services/api";
import FeatureFlowBoard from "./components/FeatureFlowBoard.vue";
import FlowChartBoard from "./components/FlowChartBoard.vue";
import ScreenSpecBoard from "./components/ScreenSpecBoard.vue";
import UserFlowBoard from "./components/UserFlowBoard.vue";

type TabKey = "prd" | "featureSpec" | "policySpec" | "userFlow" | "flowChart" | "screenSpec";
type ExportableArtifactKey = keyof WorkspaceArtifactSet;
type DomainPresetOption = Exclude<DomainPreset, "general" | "custom">;
const screenSpecBaseKeys: ArtifactKey[] = ["prd", "featureSpec", "policySpec", "userFlow", "flowChart"];

const projectNameInput = ref("홈페이지 리뉴얼 예약 보드");
const prompt = ref("외부 고객이 한 줄 아이디어만 입력하면 고품질 PRD, 기능명세서, 정책서, 유저플로우, 흐름도차트를 생성해줘");
const selectedDomainPreset = ref<DomainPreset>("general");
const customDomainType = ref("");
const activeTab = ref<TabKey>("prd");
const isGenerating = ref(false);
const isHistoryOpen = ref(false);
const currentProject = ref<ProjectSummary | null>(null);
const projectList = ref<ProjectSummary[]>([]);
const projectLogs = ref<GenerationLogItem[]>([]);
const artifactVersions = ref<Record<ArtifactKey, ArtifactVersionSummary[]>>(createEmptyVersionMap());
const contextSummary = ref("프로젝트를 생성하거나 기존 프로젝트를 불러오면 누적 컨텍스트와 로그가 여기에 쌓입니다.");
const boardRef = ref<HTMLElement | null>(null);
const errorMessage = ref("");
const screenInputs = ref<ScreenSpecInput[]>([]);

const fallbackArtifacts: WorkspaceArtifactSet = {
  prd: {
    kind: "prd",
    title: "PRD",
    version: "v1.0",
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "제품 목표",
        summary: "한 줄 아이디어를 입력하면 실행 가능한 기획 산출물을 5분 이내에 생성합니다.",
        bullets: [
          "생성 시간을 단축해 기획 착수 리드타임을 줄입니다.",
          "문서 품질을 표준화해 팀 간 커뮤니케이션 비용을 낮춥니다.",
          "산출물 히스토리와 다운로드 기능으로 재활용성을 높입니다."
        ]
      },
      {
        title: "핵심 가치",
        summary: "PM, 서비스기획자, 디자이너가 같은 입력을 기준으로 동일한 산출물을 공유합니다.",
        bullets: [
          "PRD, 기능명세서, 유저 플로우를 동시 생성합니다.",
          "문서 간 필드와 용어를 일관되게 유지합니다.",
          "재생성 시 이전 버전 대비 차이를 추적할 수 있게 설계합니다."
        ]
      }
    ]
  },
  featureSpec: {
    kind: "feature-spec",
    title: "기능명세서",
    version: "v1.0",
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "기능 범위",
        summary: "챗 입력, 문서 생성, 다운로드, 히스토리 조회를 MVP 범위로 정의합니다.",
        bullets: [
          "좌측 패널에서 아이디어와 제약조건을 입력합니다.",
          "우측 캔버스에서 탭별 산출물을 확인하고 편집합니다.",
          "PNG, PDF, Markdown으로 내보내기를 제공합니다."
        ]
      },
      {
        title: "비기능 요구사항",
        summary: "중견기업 이상 환경을 기준으로 안정성, 감사로그, 권한 모델을 반영합니다.",
        bullets: [
          "생성 요청은 모두 세션 기준으로 저장합니다.",
          "API 응답 시간과 실패율을 모니터링합니다.",
          "문서 다운로드 이력을 추적할 수 있도록 이벤트를 기록합니다."
        ]
      }
    ],
    visualization: {
      type: "feature-flow",
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          label: "회의실 예약 아이디어 입력",
          description: "기획 대상 서비스와 핵심 문제를 한 줄로 정의합니다.",
          column: 0,
          accent: "primary"
        },
        {
          id: "policy",
          label: "예약 정책 분석",
          description: "운영시간, 권한, 예외정책을 정리합니다.",
          column: 1,
          accent: "secondary"
        },
        {
          id: "calendar",
          label: "캘린더 연동 정의",
          description: "Google, Outlook 연동 범위를 확정합니다.",
          column: 1,
          accent: "neutral"
        },
        {
          id: "booking",
          label: "실시간 예약 엔진 설계",
          description: "중복 방지와 상태 반영 로직을 구조화합니다.",
          column: 2,
          accent: "primary"
        },
        {
          id: "alarm",
          label: "알림 기능 설계",
          description: "예약 생성, 변경, 취소 알림 정책을 정의합니다.",
          column: 2,
          accent: "secondary"
        },
        {
          id: "history",
          label: "이력 저장",
          description: "생성 결과와 다운로드 이력을 저장합니다.",
          column: 3,
          accent: "neutral"
        },
        {
          id: "export",
          label: "문서 다운로드",
          description: "PRD, PDF, PNG를 내보냅니다.",
          column: 3,
          accent: "primary"
        },
        {
          id: "reuse",
          label: "후속 요청 재생성",
          description: "히스토리 기반으로 다음 버전 기획을 생성합니다.",
          column: 4,
          accent: "secondary"
        }
      ],
      edges: [
        { from: "root", to: "policy", label: "분석" },
        { from: "root", to: "calendar", label: "구조화" },
        { from: "policy", to: "booking", label: "실행" },
        { from: "calendar", to: "booking", label: "연동" },
        { from: "policy", to: "alarm", label: "정책" },
        { from: "booking", to: "history", label: "저장" },
        { from: "alarm", to: "export", label: "출력" },
        { from: "history", to: "reuse", label: "재활용" },
        { from: "export", to: "reuse", label: "후속 작업" }
      ]
    }
  },
  policySpec: {
    kind: "policy-spec",
    title: "정책서",
    version: "v1.0",
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "정책 정의 범위",
        summary: "서비스 운영 정책, 권한 기준, 예외 처리 규칙을 표 형태로 정리합니다.",
        bullets: [
          "정책 컬럼은 도메인 요구사항에 맞춰 유동적으로 생성됩니다.",
          "정책 코드는 운영과 개발, QA가 공통으로 참조하는 기준 키로 사용합니다.",
          "셀 구조는 고정되지 않고 AI가 필요한 key/value 조합으로 확장할 수 있습니다."
        ]
      }
    ],
    visualization: {
      type: "policy-table",
      title: "회의실 예약 정책 정의서",
      columns: [
        { key: "policyCode", label: "정책 코드" },
        { key: "policyName", label: "정책명" },
        { key: "detail", label: "세부 항목" },
        { key: "user", label: "사용자" },
        { key: "definition", label: "정책 정의" },
        { key: "note", label: "비고" }
      ],
      rows: [
        {
          id: "policy-1",
          values: {
            policyCode: "meeting-book-01",
            policyName: "회의실 예약 정책",
            detail: "중복 예약 방지",
            user: "로그인 사용자",
            definition: "동일 회의실과 동일 시간에는 먼저 승인된 요청만 예약 성공 처리",
            note: "실패 시 대체 시간 제안"
          }
        },
        {
          id: "policy-2",
          values: {
            policyCode: "meeting-alert-01",
            policyName: "알림 정책",
            detail: "예약 변경 알림",
            user: "예약자/운영자",
            definition: "예약 생성, 변경, 취소 시 앱 푸시와 이메일 동시 발송",
            note: "사용자 채널 설정 반영"
          }
        },
        {
          id: "policy-3",
          values: {
            policyCode: "meeting-auth-01",
            policyName: "인증 정책",
            detail: "비밀번호 오류 제한",
            user: "비회원/회원",
            definition: "로그인 실패 5회 이상이면 10분간 추가 로그인 제한",
            note: "보안 이벤트 로그 기록"
          }
        }
      ]
    }
  },
  userFlow: {
    kind: "user-flow",
    title: "유저 플로우",
    version: "v1.0",
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "메인 플로우",
        summary: "사용자는 아이디어 입력 후 PRD, 기능명세서, 유저 플로우를 순차 탐색합니다.",
        bullets: [
          "아이디어 입력 -> 생성 요청 -> 문서 렌더링",
          "탭 전환 -> 문서 검토 -> 다운로드 실행",
          "히스토리 열기 -> 이전 세션 조회 -> 재사용"
        ]
      },
      {
        title: "예외 플로우",
        summary: "입력값 부족, LLM 실패, 내보내기 실패에 대한 복구 흐름을 제공합니다.",
        bullets: [
          "입력값이 짧으면 보완 질문을 제안합니다.",
          "LLM 실패 시 템플릿 기반 초안을 제공합니다.",
          "다운로드 실패 시 형식을 변경해 재시도할 수 있게 합니다."
        ]
      }
    ],
    visualization: {
      type: "tree-map",
      title: "IA 기반 유저 플로우 구조",
      root: {
        id: "root",
        label: "서비스 시작",
        description: "사용자가 서비스에 진입해 주요 메뉴를 탐색합니다.",
        accent: "neutral",
        children: [
          {
            id: "auth",
            label: "인증",
            accent: "primary",
            children: [
              { id: "auth-login", label: "로그인", accent: "primary" },
              { id: "auth-register", label: "회원가입" },
              { id: "auth-reset", label: "비밀번호 찾기" }
            ]
          },
          {
            id: "dashboard",
            label: "대시보드",
            accent: "primary",
            children: [
              {
                id: "meeting",
                label: "회의실 조회",
                children: [
                  { id: "meeting-search", label: "회의실 검색" },
                  { id: "meeting-detail", label: "회의실 상세" },
                  { id: "meeting-book", label: "예약하기", accent: "secondary" }
                ]
              },
              {
                id: "reservation",
                label: "예약 관리",
                children: [
                  { id: "reservation-list", label: "내 예약 목록" },
                  { id: "reservation-detail", label: "예약 상세 보기" },
                  { id: "reservation-update", label: "예약 변경" },
                  { id: "reservation-cancel", label: "예약 취소" }
                ]
              },
              {
                id: "setting",
                label: "설정",
                accent: "secondary",
                children: [
                  { id: "setting-alert", label: "알림 설정" },
                  { id: "setting-profile", label: "계정 설정" },
                  { id: "setting-provider", label: "연동 관리" },
                  { id: "setting-logout", label: "로그아웃" }
                ]
              }
            ]
          }
        ]
      }
    }
  },
  flowChart: {
    kind: "flow-chart",
    title: "흐름도차트",
    version: "v1.0",
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "업무 흐름 구조",
        summary: "흐름도는 메뉴 구조가 아니라 실제 처리 절차와 의사결정 분기를 수직 축 기준으로 표현합니다.",
        bullets: [
          "시작/종료, 처리, 입출력, 분기 노드를 분리해 업무 흐름을 시각화합니다.",
          "메인 흐름은 상단에서 하단으로 이어지고, 조건 분기는 좌우로 확장됩니다.",
          "유저플로우와 달리 IA가 아닌 프로세스 중심의 수직 도식으로 구성합니다."
        ]
      },
      {
        title: "활용 포인트",
        summary: "기획, 개발, 운영이 같은 처리 순서를 기준으로 논의할 수 있게 설계합니다.",
        bullets: [
          "예외 처리와 품질 점검 분기를 한 번에 확인할 수 있습니다.",
          "정책서와 기능명세서의 규칙을 실행 순서에 맞게 검토할 수 있습니다.",
          "업무 절차 설명용 이미지나 문서 export에도 그대로 활용할 수 있습니다."
        ]
      }
    ],
    visualization: {
      type: "flow-chart",
      title: "회의실 예약 업무 흐름도",
      nodes: [
        {
          id: "start",
          label: "예약 시작",
          description: "사용자가 예약 플로우에 진입합니다.",
          column: 1,
          row: 0,
          shape: "terminator",
          accent: "neutral"
        },
        {
          id: "select-room",
          label: "회의실 선택",
          description: "회의실과 사용 시간을 선택합니다.",
          column: 1,
          row: 1,
          shape: "process",
          accent: "secondary"
        },
        {
          id: "rule-check",
          label: "예약 가능 여부 확인",
          description: "중복 예약, 권한, 운영시간 정책을 검사합니다.",
          column: 1,
          row: 2,
          shape: "decision",
          accent: "primary"
        },
        {
          id: "guide",
          label: "대체 시간 안내",
          description: "불가 시 다른 시간대와 회의실 후보를 제안합니다.",
          column: 2,
          row: 2,
          shape: "document",
          accent: "secondary"
        },
        {
          id: "reserve",
          label: "예약 생성",
          description: "예약 엔진이 확정 상태를 생성합니다.",
          column: 1,
          row: 3,
          shape: "process",
          accent: "secondary"
        },
        {
          id: "sync",
          label: "캘린더 연동",
          description: "Google/Outlook 일정에 동기화합니다.",
          column: 1,
          row: 4,
          shape: "subprocess",
          accent: "primary"
        },
        {
          id: "notify-check",
          label: "알림 발송 필요 여부",
          description: "사용자 채널 설정과 상태 변경을 확인합니다.",
          column: 1,
          row: 5,
          shape: "decision",
          accent: "primary"
        },
        {
          id: "notify",
          label: "알림 발송",
          description: "이메일과 푸시를 발송합니다.",
          column: 1,
          row: 6,
          shape: "process",
          accent: "secondary"
        },
        {
          id: "skip-notify",
          label: "즉시 완료 처리",
          description: "알림 조건이 없으면 바로 완료 화면으로 이동합니다.",
          column: 2,
          row: 5,
          shape: "document",
          accent: "secondary"
        },
        {
          id: "end",
          label: "예약 완료",
          description: "사용자에게 예약 결과를 노출합니다.",
          column: 1,
          row: 7,
          shape: "terminator",
          accent: "neutral"
        }
      ],
      edges: [
        { from: "start", to: "select-room" },
        { from: "select-room", to: "rule-check" },
        { from: "rule-check", to: "reserve", label: "YES" },
        { from: "rule-check", to: "guide", label: "NO" },
        { from: "guide", to: "rule-check", label: "재선택" },
        { from: "reserve", to: "sync" },
        { from: "sync", to: "notify-check" },
        { from: "notify-check", to: "notify", label: "YES" },
        { from: "notify-check", to: "skip-notify", label: "NO" },
        { from: "notify", to: "end" },
        { from: "skip-notify", to: "end" }
      ]
    }
  },
  screenSpec: {
    kind: "screen-spec",
    title: "화면기획서",
    version: "v1.0",
    generatedAt: new Date().toISOString(),
    sections: [
      {
        title: "화면기획 목적",
        summary: "업로드한 화면 이미지와 기존 산출물을 연결해 화면정의서를 생성합니다.",
        bullets: [
          "메타 정보, 번호 마커, 기능 정의, 정책 연결, 관련 화면, 수정 로그를 함께 제공합니다.",
          "PRD와 기능명세서, 정책서, 유저플로우, 흐름도차트의 내용을 화면 단위로 재정렬합니다.",
          "대기업 PM 수준의 리뷰/핸드오프 문서 형태를 기본으로 사용합니다."
        ]
      },
      {
        title: "활용 방식",
        summary: "기획 리뷰, 개발 핸드오프, QA 시나리오 작성에 바로 활용할 수 있습니다.",
        bullets: [
          "화면별 핵심 영역을 번호 마커로 설명합니다.",
          "기능 정의와 정책 연결을 하단 표 형식으로 제공합니다.",
          "수정 로그와 연결 화면을 통해 협업 히스토리를 정리합니다."
        ]
      },
      {
        title: "준비 사항",
        summary: "좌측 패널에서 화면 ID/이름/경로/이미지를 입력하면 해당 정보를 생성 프롬프트에 포함합니다.",
        bullets: [
          "이미지가 없으면 placeholder 기반 초안을 생성합니다.",
          "여러 화면을 함께 업로드하면 다장 형태의 화면기획서가 생성됩니다.",
          "같은 프로젝트에서 후속 요청으로 화면기획서를 계속 개선할 수 있습니다."
        ]
      }
    ]
  }
};

function createEmptyVersionMap(): Record<ArtifactKey, ArtifactVersionSummary[]> {
  return {
    prd: [],
    featureSpec: [],
    policySpec: [],
    userFlow: [],
    flowChart: [],
    screenSpec: []
  };
}

function createEmptyScreenInput(index = 1): ScreenSpecInput {
  return {
    screenId: `screen-${String(index).padStart(2, "0")}`,
    screenName: "",
    route: "",
    systemName: "",
    author: "",
    notes: "",
    imageName: "",
    imageDataUrl: ""
  };
}

function buildLocalProject(name: string): ProjectSummary {
  const now = new Date().toISOString();
  const domainType = resolveDomainType() || "general";
  return {
    id: crypto.randomUUID(),
    name,
    domainType,
    createdAt: now,
    updatedAt: now,
    contextSummary: `${name} 프로젝트 생성 (${domainType} 도메인)`,
    lastPrompt: ""
  };
}

const domainPresetOptions = DOMAIN_PRESET_OPTIONS.filter(
  (option): option is DomainPresetOption => option !== "general" && option !== "custom"
);

const domainPresetLabels: Record<DomainPresetOption | "general" | "custom", string> = {
  general: "일반 서비스",
  commerce: "커머스",
  erp: "ERP",
  groupware: "그룹웨어",
  mes: "MES",
  finance: "금융",
  healthcare: "헬스케어",
  logistics: "물류",
  edtech: "에듀테크",
  custom: "기타(직접작성)"
};

function resolveDomainType() {
  if (selectedDomainPreset.value === "custom") {
    return customDomainType.value.trim();
  }

  return selectedDomainPreset.value;
}

function syncDomainSelection(domainType?: string) {
  const normalized = domainType?.trim();
  if (!normalized) {
    selectedDomainPreset.value = "general";
    customDomainType.value = "";
    return;
  }

  if ((DOMAIN_PRESET_OPTIONS as readonly string[]).includes(normalized) && normalized !== "custom") {
    selectedDomainPreset.value = normalized as DomainPreset;
    customDomainType.value = "";
    return;
  }

  selectedDomainPreset.value = "custom";
  customDomainType.value = normalized;
}

function syncScreenInputsFromArtifacts(nextArtifacts: WorkspaceArtifactSet) {
  const visualization = nextArtifacts.screenSpec.visualization;
  if (visualization?.type !== "screen-spec") {
    screenInputs.value = [];
    return;
  }

  screenInputs.value = visualization.screens.map((screen, index) => ({
    screenId: screen.screenId || `screen-${String(index + 1).padStart(2, "0")}`,
    screenName: screen.screenName,
    route: screen.route ?? "",
    systemName: screen.systemName ?? "",
    author: screen.author ?? "",
    notes: screen.notes ?? "",
    imageName: screen.imageName ?? "",
    imageDataUrl: screen.imageDataUrl ?? ""
  }));
}

function addScreenInput() {
  screenInputs.value = [...screenInputs.value, createEmptyScreenInput(screenInputs.value.length + 1)];
}

function removeScreenInput(index: number) {
  screenInputs.value = screenInputs.value.filter((_, currentIndex) => currentIndex !== index);
}

async function handleScreenImageUpload(event: Event, index: number) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  screenInputs.value[index] = {
    ...screenInputs.value[index],
    imageName: file.name,
    imageDataUrl: dataUrl
  };
}

function buildScreenInputsPayload() {
  const trimmed = screenInputs.value
    .map((screenInput, index) => ({
      ...screenInput,
      screenId: screenInput.screenId.trim() || `screen-${String(index + 1).padStart(2, "0")}`,
      screenName: screenInput.screenName.trim(),
      route: screenInput.route?.trim() || undefined,
      systemName: screenInput.systemName?.trim() || undefined,
      author: screenInput.author?.trim() || undefined,
      notes: screenInput.notes?.trim() || undefined,
      imageName: screenInput.imageName?.trim() || undefined,
      imageDataUrl: screenInput.imageDataUrl?.trim() || ""
    }))
    .filter((screenInput) => screenInput.screenName || screenInput.imageDataUrl || screenInput.notes || screenInput.route);

  const invalid = trimmed.find((screenInput) => !screenInput.screenName || !screenInput.imageDataUrl);
  if (invalid) {
    return {
      error: "화면기획서용 화면은 이름과 이미지를 함께 입력해 주세요.",
      payload: [] as ScreenSpecInput[]
    };
  }

  return {
    error: "",
    payload: trimmed
  };
}

const selectedDomainLabel = computed(() => {
  if (selectedDomainPreset.value === "custom") {
    return customDomainType.value.trim() || "직접입력";
  }

  return domainPresetLabels[selectedDomainPreset.value];
});

const artifacts = ref<WorkspaceArtifactSet>(fallbackArtifacts);
const suggestedActions = ref<string[]>([
  "핵심 사용자군 3개를 정의해줘",
  "MVP 제외 범위를 따로 정리해줘",
  "유저 플로우를 운영자 기준으로 다시 써줘"
]);

const tabItems: Array<{ key: TabKey; label: string }> = [
  { key: "prd", label: "PRD" },
  { key: "userFlow", label: "유저플로우" },
  { key: "flowChart", label: "흐름도차트" },
  { key: "policySpec", label: "정책서" },
  { key: "featureSpec", label: "기능명세서" },
  { key: "screenSpec", label: "화면기획서" }
];

const currentDocument = computed<ArtifactDocument>(() => artifacts.value[activeTab.value]);

const featureFlowVisualization = computed<FeatureFlowVisualization | null>(() => {
  const visualization = currentDocument.value.visualization;
  return visualization?.type === "feature-flow" ? visualization : null;
});

const userFlowVisualization = computed<TreeMapVisualization | null>(() => {
  const visualization = currentDocument.value.visualization;
  return visualization?.type === "tree-map" ? visualization : null;
});

const policyTableVisualization = computed<PolicyTableVisualization | null>(() => {
  const visualization = currentDocument.value.visualization;
  return visualization?.type === "policy-table" ? visualization : null;
});

const flowChartVisualization = computed<FlowChartVisualization | null>(() => {
  const visualization = currentDocument.value.visualization;
  return visualization?.type === "flow-chart" ? visualization : null;
});

const screenSpecVisualization = computed<ScreenSpecVisualization | null>(() => {
  const visualization = currentDocument.value.visualization;
  return visualization?.type === "screen-spec" ? visualization : null;
});

const canGenerateScreenSpec = computed(() => {
  if (!currentProject.value) {
    return false;
  }

  return screenSpecBaseKeys.every(
    (key) =>
      artifactVersions.value[key].length > 0 ||
      artifacts.value[key].generatedAt !== fallbackArtifacts[key].generatedAt ||
      artifacts.value[key].version === "draft"
  );
});

const primaryGenerateButtonLabel = computed(() => {
  if (isGenerating.value) {
    return activeTab.value === "screenSpec" ? "화면기획서 생성 중..." : "문서 생성 중...";
  }

  return activeTab.value === "screenSpec" ? "화면기획서 생성" : "문서 생성";
});

const primaryGenerateDisabled = computed(() => {
  if (isGenerating.value) {
    return true;
  }

  if (activeTab.value === "screenSpec") {
    return !canGenerateScreenSpec.value;
  }

  return false;
});

function buildFallbackResponse(targetArtifact?: ArtifactKey): GenerationResponse {
  const project = currentProject.value ?? buildLocalProject(projectNameInput.value.trim() || "로컬 프로젝트");
  const normalized = prompt.value.trim();
  const domainType = resolveDomainType() || project.domainType || "general";
  const title = normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;
  const now = new Date().toISOString();
  const fallbackLogs: GenerationLogItem[] = [
    {
      sessionId: crypto.randomUUID(),
      projectId: project.id,
      projectName: project.name,
      prompt: normalized,
      createdAt: now,
      targetArtifact,
      summary: normalized
    },
    ...projectLogs.value
  ].slice(0, 20);

  return {
    project: {
      ...project,
      domainType,
      updatedAt: now,
      lastPrompt: normalized,
      contextSummary: `${project.name} 프로젝트의 ${domainType} 도메인 로컬 컨텍스트를 기반으로 결과를 생성했습니다.`
    },
    sessionId: fallbackLogs[0].sessionId,
    artifacts: {
      prd: {
        ...fallbackArtifacts.prd,
        title: `${title || project.name} PRD`,
        generatedAt: now
      },
      featureSpec: {
        ...fallbackArtifacts.featureSpec,
        title: `${title || project.name} 기능명세서`,
        generatedAt: now
      },
      policySpec: {
        ...fallbackArtifacts.policySpec,
        title: `${title || project.name} 정책서`,
        generatedAt: now
      },
      userFlow: {
        ...fallbackArtifacts.userFlow,
        title: `${title || project.name} 유저플로우`,
        generatedAt: now
      },
      flowChart: {
        ...fallbackArtifacts.flowChart,
        title: `${title || project.name} 흐름도차트`,
        generatedAt: now
      },
      screenSpec: {
        ...fallbackArtifacts.screenSpec,
        title: `${title || project.name} 화면기획서`,
        generatedAt: now
      }
    },
    suggestedActions: suggestedActions.value,
    contextSummary: `${project.name} 프로젝트의 ${domainType} 도메인 로컬 컨텍스트를 기반으로 결과를 생성했습니다.`,
    logs: fallbackLogs,
    versions: artifactVersions.value
  };
}

function hydrateProjectDetail(detail: ProjectDetail | GenerationResponse) {
  currentProject.value = detail.project;
  projectNameInput.value = detail.project.name;
  syncDomainSelection(detail.project.domainType);
  artifacts.value = detail.artifacts;
  syncScreenInputsFromArtifacts(detail.artifacts);
  suggestedActions.value = detail.suggestedActions;
  projectLogs.value = detail.logs;
  artifactVersions.value = detail.versions;
  contextSummary.value = detail.contextSummary;
}

async function loadProjects() {
  try {
    projectList.value = await api.getProjects();
    if (!currentProject.value && projectList.value[0]) {
      await selectProject(projectList.value[0].id);
    }
  } catch {
    if (currentProject.value) {
      projectList.value = [currentProject.value];
      return;
    }

    const localProject = buildLocalProject(projectNameInput.value.trim() || "로컬 프로젝트");
    currentProject.value = localProject;
    projectList.value = [localProject];
  }
}

async function selectProject(projectId: string) {
  errorMessage.value = "";

  try {
    const detail = await api.getProjectDetail(projectId);
    hydrateProjectDetail(detail);
  } catch {
    const selected = projectList.value.find((project) => project.id === projectId);
    if (selected) {
      currentProject.value = selected;
      projectNameInput.value = selected.name;
      syncDomainSelection(selected.domainType);
    }
    errorMessage.value = "프로젝트를 불러오지 못했습니다.";
  }
}

async function createProject() {
  const name = projectNameInput.value.trim();
  const domainType = resolveDomainType();
  if (!name) {
    errorMessage.value = "프로젝트명을 입력해 주세요.";
    return;
  }

  if (!domainType) {
    errorMessage.value = "도메인 유형을 선택하거나 직접 입력해 주세요.";
    return;
  }

  errorMessage.value = "";

  try {
    const project = await api.createProject({ name, domainType });
    currentProject.value = project;
    artifacts.value = fallbackArtifacts;
    screenInputs.value = [];
    suggestedActions.value = [
      "핵심 사용자를 3개로 나눠줘",
      "운영 정책을 먼저 정의해줘",
      "대규모 시스템 기준 제약조건을 추가해줘"
    ];
    projectLogs.value = [];
    artifactVersions.value = createEmptyVersionMap();
    contextSummary.value = `${project.name} 프로젝트를 생성했습니다. 이제 ${domainType} 도메인 기준으로 누적 컨텍스트가 쌓입니다.`;
    await loadProjects();
  } catch {
    const project = buildLocalProject(name);
    currentProject.value = project;
    projectList.value = [project, ...projectList.value.filter((item) => item.id !== project.id)];
    projectLogs.value = [];
    artifactVersions.value = createEmptyVersionMap();
    contextSummary.value = `${project.name} 프로젝트를 ${project.domainType} 도메인 기준 로컬 상태로 생성했습니다.`;
    screenInputs.value = [];
  }
}

async function generateArtifacts(targetArtifact?: ArtifactKey) {
  const domainType = resolveDomainType();
  const screenInputPayload = buildScreenInputsPayload();
  if (!prompt.value.trim()) {
    errorMessage.value = "아이디어를 한 줄 이상 입력해 주세요.";
    return;
  }

  if (!currentProject.value) {
    errorMessage.value = "먼저 프로젝트를 생성하거나 불러와 주세요.";
    return;
  }

  if (!domainType) {
    errorMessage.value = "도메인 유형을 선택하거나 직접 입력해 주세요.";
    return;
  }

  if (targetArtifact === "screenSpec" && !canGenerateScreenSpec.value) {
    errorMessage.value = "먼저 PRD, 기능명세서, 정책서, 유저플로우, 흐름도차트를 생성해 주세요.";
    return;
  }

  if (screenInputPayload.error) {
    errorMessage.value = screenInputPayload.error;
    return;
  }

  isGenerating.value = true;
  errorMessage.value = "";

  try {
    const response = await api.generate({
      projectId: currentProject.value.id,
      prompt: prompt.value,
      targetArtifact,
      domainType,
      screenInputs: screenInputPayload.payload
    });
    hydrateProjectDetail(response);
    await loadProjects();
  } catch {
    const fallback = buildFallbackResponse(targetArtifact);
    hydrateProjectDetail(fallback);
    await loadProjects();
  } finally {
    isGenerating.value = false;
  }
}

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatVisualization(document: ArtifactDocument) {
  const visualization = document.visualization;
  if (!visualization) {
    return [];
  }

  if (visualization.type === "feature-flow") {
    return [
      "## 기능 플로우 그래프",
      "",
      ...visualization.nodes.map((node) => `- [${node.column}] ${node.label}: ${node.description ?? ""}`),
      "",
      "### 연결 관계",
      "",
      ...visualization.edges.map((edge) => `- ${edge.from} -> ${edge.to}${edge.label ? ` (${edge.label})` : ""}`),
      ""
    ];
  }

  if (visualization.type === "policy-table") {
    return [
      `## ${visualization.title}`,
      "",
      `| ${visualization.columns.map((column) => column.label).join(" | ")} |`,
      `| ${visualization.columns.map(() => "---").join(" | ")} |`,
      ...visualization.rows.map((row) =>
        `| ${visualization.columns.map((column) => row.values[column.key] ?? "").join(" | ")} |`
      ),
      ""
    ];
  }

  if (visualization.type === "flow-chart") {
    return [
      `## ${visualization.title}`,
      "",
      ...visualization.nodes.map(
        (node) =>
          `- [${node.column},${node.row}] ${node.label} (${node.shape})${node.description ? `: ${node.description}` : ""}`
      ),
      "",
      "### 연결 관계",
      "",
      ...visualization.edges.map((edge) => `- ${edge.from} -> ${edge.to}${edge.label ? ` (${edge.label})` : ""}`),
      ""
    ];
  }

  if (visualization.type === "screen-spec") {
    return visualization.screens.flatMap((screen) => [
      `## ${screen.screenName} (${screen.screenId})`,
      "",
      `- 경로: ${screen.route ?? "-"}`,
      `- 작성자: ${screen.author ?? "-"}`,
      `- 작성일: ${screen.createdDate ?? "-"}`,
      "",
      "### 번호 마커",
      "",
      ...screen.markers.map(
        (marker) =>
          `- ${marker.number}. ${marker.title} (${marker.x}%, ${marker.y}%): ${marker.description ?? ""}`
      ),
      "",
      "### 기능 정의",
      "",
      ...screen.functionalRequirements.map(
        (requirement) => `- ${requirement.no}. ${requirement.title}: ${requirement.description}`
      ),
      ""
    ]);
  }

  function walkTree(node: TreeMapNode, depth = 0): string[] {
    return [
      `${"  ".repeat(depth)}- ${node.label}${node.description ? `: ${node.description}` : ""}`,
      ...(node.children?.flatMap((child) => walkTree(child, depth + 1)) ?? [])
    ];
  }

  return [
    `## ${visualization.title}`,
    "",
    ...walkTree(visualization.root),
    ""
  ];
}

function formatDocument(document: ArtifactDocument) {
  return [
    `# ${document.title}`,
    "",
    `버전: ${document.version}`,
    `생성일: ${new Date(document.generatedAt).toLocaleString("ko-KR")}`,
    "",
    ...document.sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      section.summary,
      "",
      ...section.bullets.map((bullet) => `- ${bullet}`),
      ""
    ]),
    ...formatVisualization(document)
  ].join("\n");
}

function downloadMarkdown() {
  downloadText(`${currentDocument.value.title}.md`, formatDocument(currentDocument.value), "text/markdown;charset=utf-8");
}

async function downloadImage() {
  if (!boardRef.value) {
    return;
  }

  const board = boardRef.value;

  board.classList.add("document-board--image-export");

  try {
    await nextTick();

    const dataUrl = await toPng(board, {
      cacheBust: true,
      pixelRatio: 2
    });

    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `${currentDocument.value.title}.png`;
    anchor.click();
  } finally {
    board.classList.remove("document-board--image-export");
  }
}

function downloadPdf() {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4"
  });

  const lines = pdf.splitTextToSize(formatDocument(currentDocument.value), 500);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(lines, 40, 50);
  pdf.save(`${currentDocument.value.title}.pdf`);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSectionsHtml(document: ArtifactDocument) {
  return `
    <div class="document-root">
      ${document.sections
        .map(
          (section) => `
            <section class="document-node">
              <div class="document-node__header">
                <span class="dot"></span>
                <strong>${escapeHtml(section.title)}</strong>
              </div>
              <p>${escapeHtml(section.summary)}</p>
              <ul>
                ${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
              </ul>
            </section>
          `
        )
        .join("")}
    </div>
  `;
}

function renderFeatureFlowHtml(visualization: FeatureFlowVisualization) {
  const grouped = new Map<number, FeatureFlowVisualization["nodes"]>();
  for (const node of visualization.nodes) {
    const nodes = grouped.get(node.column) ?? [];
    nodes.push(node);
    grouped.set(node.column, nodes);
  }

  const columns = Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(
      ([column, nodes]) => `
        <div class="feature-flow__column">
          <span class="feature-flow__column-title">STEP ${column + 1}</span>
          ${nodes
            .map(
              (node) => `
                <article class="flow-node flow-node--${node.accent ?? "neutral"}">
                  <strong>${escapeHtml(node.label)}</strong>
                  <p>${escapeHtml(node.description ?? "")}</p>
                </article>
              `
            )
            .join("")}
        </div>
      `
    )
    .join("");

  const edges = visualization.edges
    .map(
      (edge) => `
        <li><strong>${escapeHtml(edge.from)}</strong> -> <strong>${escapeHtml(edge.to)}</strong>${edge.label ? ` (${escapeHtml(edge.label)})` : ""}</li>
      `
    )
    .join("");

  return `
    <section class="visual-section">
      <div class="visual-section__header">
        <div>
          <span class="label">추가 시각화</span>
          <h2>기능 플로우 그래프</h2>
        </div>
      </div>
      <div class="feature-flow feature-flow--static">
        <div class="feature-flow__columns">
          ${columns}
        </div>
      </div>
      <div class="html-edge-list">
        <h3>연결 관계</h3>
        <ul>${edges}</ul>
      </div>
    </section>
  `;
}

function renderPolicyTableHtml(visualization: PolicyTableVisualization) {
  return `
    <section class="visual-section">
      <div class="visual-section__header">
        <div>
          <span class="label">추가 시각화</span>
          <h2>${escapeHtml(visualization.title)}</h2>
        </div>
      </div>
      <div class="policy-table-wrap">
        <table class="policy-table">
          <thead>
            <tr>
              ${visualization.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${visualization.rows
              .map(
                (row) => `
                  <tr>
                    ${visualization.columns
                      .map((column) => `<td>${escapeHtml(row.values[column.key] ?? "-")}</td>`)
                      .join("")}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFlowChartHtml(visualization: FlowChartVisualization) {
  const columnCount = visualization.nodes.reduce((acc, node) => Math.max(acc, node.column), 0) + 1;
  const rowCount = visualization.nodes.reduce((acc, node) => Math.max(acc, node.row), 0) + 1;

  const nodes = visualization.nodes
    .map(
      (node) => `
        <article
          class="html-flow-node html-flow-node--${node.shape} html-flow-node--${node.accent ?? "neutral"}"
          style="grid-column: ${node.column + 1}; grid-row: ${node.row + 1};"
        >
          <div class="html-flow-node__content">
            <strong>${escapeHtml(node.label)}</strong>
            ${node.description ? `<p>${escapeHtml(node.description)}</p>` : ""}
          </div>
        </article>
      `
    )
    .join("");

  const edges = visualization.edges
    .map(
      (edge) =>
        `<li><strong>${escapeHtml(edge.from)}</strong> -> <strong>${escapeHtml(edge.to)}</strong>${edge.label ? ` (${escapeHtml(edge.label)})` : ""}</li>`
    )
    .join("");

  return `
    <section class="visual-section">
      <div class="visual-section__header">
        <div>
          <span class="label">추가 시각화</span>
          <h2>${escapeHtml(visualization.title)}</h2>
        </div>
      </div>
      <div class="html-flow-chart">
        <div
          class="html-flow-chart__board"
          style="grid-template-columns: repeat(${columnCount}, minmax(220px, 240px)); grid-template-rows: repeat(${rowCount}, minmax(140px, auto));"
        >
          ${nodes}
        </div>
      </div>
      <div class="html-edge-list">
        <h3>연결 관계</h3>
        <ul>${edges}</ul>
      </div>
    </section>
  `;
}

function renderTreeNodeHtml(node: TreeMapNode): string {
  return `
    <div class="tree-branch">
      <div class="tree-branch__self">
        <div class="tree-node tree-node--${node.accent ?? "neutral"}">
          <strong>${escapeHtml(node.label)}</strong>
          ${node.description ? `<p>${escapeHtml(node.description)}</p>` : ""}
        </div>
      </div>
      ${
        node.children?.length
          ? `<div class="tree-branch__children">${node.children.map((child) => renderTreeNodeHtml(child)).join("")}</div>`
          : ""
      }
    </div>
  `;
}

function renderTreeMapHtml(visualization: TreeMapVisualization) {
  return `
    <section class="visual-section">
      <div class="visual-section__header">
        <div>
          <span class="label">추가 시각화</span>
          <h2>${escapeHtml(visualization.title)}</h2>
        </div>
      </div>
      <div class="tree-map">
        ${renderTreeNodeHtml(visualization.root)}
      </div>
    </section>
  `;
}

function renderScreenSpecHtml(visualization: ScreenSpecVisualization) {
  return `
    <section class="visual-section">
      <div class="visual-section__header">
        <div>
          <span class="label">추가 시각화</span>
          <h2>${escapeHtml(visualization.title)}</h2>
        </div>
      </div>
      <div class="screen-spec-export">
        ${visualization.screens
          .map(
            (screen) => `
              <article class="screen-spec-export__sheet">
                <div class="screen-spec-export__meta">
                  <div class="screen-spec-export__meta-item"><span>시스템명</span><strong>${escapeHtml(screen.systemName ?? "-")}</strong></div>
                  <div class="screen-spec-export__meta-item"><span>화면 ID</span><strong>${escapeHtml(screen.screenId)}</strong></div>
                  <div class="screen-spec-export__meta-item"><span>화면명</span><strong>${escapeHtml(screen.screenName)}</strong></div>
                  <div class="screen-spec-export__meta-item"><span>경로</span><strong>${escapeHtml(screen.route ?? "-")}</strong></div>
                  <div class="screen-spec-export__meta-item"><span>작성자</span><strong>${escapeHtml(screen.author ?? "-")}</strong></div>
                  <div class="screen-spec-export__meta-item"><span>작성일</span><strong>${escapeHtml(screen.createdDate ?? "-")}</strong></div>
                </div>
                <div class="screen-spec-export__layout">
                  <section class="screen-spec-export__image-panel">
                    <div class="screen-spec-export__image-wrap">
                      <img src="${escapeHtml(screen.imageDataUrl)}" alt="${escapeHtml(screen.screenName)}" class="screen-spec-export__image" />
                      ${screen.markers
                        .map(
                          (marker) => `
                            <span class="screen-spec-export__marker" style="left:${marker.x}%; top:${marker.y}%;">${marker.number}</span>
                          `
                        )
                        .join("")}
                    </div>
                  </section>
                  <section class="screen-spec-export__side">
                    ${screen.markers
                      .map(
                        (marker) => `
                          <article class="screen-spec-export__card">
                            <strong>${marker.number}. ${escapeHtml(marker.title)}</strong>
                            <p>${escapeHtml(marker.description ?? "-")}</p>
                          </article>
                        `
                      )
                      .join("")}
                    ${screen.descriptionSections
                      .map(
                        (section) => `
                          <article class="screen-spec-export__card">
                            <strong>${escapeHtml(section.title)}</strong>
                            <ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>
                          </article>
                        `
                      )
                      .join("")}
                  </section>
                </div>
                <div class="screen-spec-export__tables">
                  <table class="screen-spec-export__table">
                    <thead><tr><th>No</th><th>기능명</th><th>설명</th></tr></thead>
                    <tbody>
                      ${screen.functionalRequirements
                        .map(
                          (requirement) => `
                            <tr>
                              <td>${requirement.no}</td>
                              <td>${escapeHtml(requirement.title)}</td>
                              <td>${escapeHtml(requirement.description)}</td>
                            </tr>
                          `
                        )
                        .join("")}
                    </tbody>
                  </table>
                  <table class="screen-spec-export__table">
                    <thead><tr><th>정책명</th><th>설명</th></tr></thead>
                    <tbody>
                      ${
                        screen.policyReferences.length
                          ? screen.policyReferences
                              .map(
                                (policy) => `
                                  <tr>
                                    <td>${escapeHtml(policy.policyName)}</td>
                                    <td>${escapeHtml(policy.summary)}</td>
                                  </tr>
                                `
                              )
                              .join("")
                          : '<tr><td colspan="2">연결된 정책이 없습니다.</td></tr>'
                      }
                    </tbody>
                  </table>
                  <table class="screen-spec-export__table">
                    <thead><tr><th>화면명</th><th>대상 ID</th><th>설명</th></tr></thead>
                    <tbody>
                      ${
                        screen.relatedScreens.length
                          ? screen.relatedScreens
                              .map(
                                (link) => `
                                  <tr>
                                    <td>${escapeHtml(link.label)}</td>
                                    <td>${escapeHtml(link.targetScreenId ?? "-")}</td>
                                    <td>${escapeHtml(link.description ?? "-")}</td>
                                  </tr>
                                `
                              )
                              .join("")
                          : '<tr><td colspan="3">연결된 화면이 없습니다.</td></tr>'
                      }
                    </tbody>
                  </table>
                  <table class="screen-spec-export__table">
                    <thead><tr><th>일자</th><th>내용</th></tr></thead>
                    <tbody>
                      ${screen.changeLog
                        .map(
                          (log) => `
                            <tr>
                              <td>${escapeHtml(log.date)}</td>
                              <td>${escapeHtml(log.description)}</td>
                            </tr>
                          `
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderVisualizationHtml(document: ArtifactDocument) {
  const visualization = document.visualization;

  if (!visualization) {
    return "";
  }

  if (visualization.type === "feature-flow") {
    return renderFeatureFlowHtml(visualization);
  }

  if (visualization.type === "policy-table") {
    return renderPolicyTableHtml(visualization);
  }

  if (visualization.type === "flow-chart") {
    return renderFlowChartHtml(visualization);
  }

  if (visualization.type === "screen-spec") {
    return renderScreenSpecHtml(visualization);
  }

  return renderTreeMapHtml(visualization);
}

function getBoardPanelHtml(document: ArtifactDocument) {
  return `
    <div class="board-panel-export">
      <div class="board-toolbar">
        <div>
          <span class="label">현재 산출물</span>
          <h1>${escapeHtml(document.title)}</h1>
        </div>
        <div class="board-meta">
          <span>${escapeHtml(document.version)}</span>
          <span>${escapeHtml(new Date(document.generatedAt).toLocaleString("ko-KR"))}</span>
        </div>
      </div>
      <div class="document-board">
        ${renderSectionsHtml(document)}
        ${renderVisualizationHtml(document)}
      </div>
    </div>
  `;
}

function buildStandaloneHtml(document: ArtifactDocument) {
  const styles = `
    body { margin: 0; padding: 24px; background: #f7faf8; font-family: Pretendard, "Noto Sans KR", Arial, sans-serif; color: #262626; }
    .board-panel-export { padding: 22px; border: 1px solid #e8ece8; border-radius: 24px; background: rgba(255,255,255,0.96); box-shadow: 0 20px 50px rgba(12,58,39,0.08); }
    .board-toolbar { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 20px; }
    .board-toolbar h1 { margin: 4px 0 0; font-size: 30px; }
    .board-meta { display: flex; gap: 12px; color: #777777; font-size: 13px; }
    .label { display: inline-block; margin-bottom: 6px; color: #777777; font-size: 12px; font-weight: 600; }
    .document-board { border-radius: 20px; padding: 28px; background-image: linear-gradient(rgba(0,105,77,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,105,77,0.06) 1px, transparent 1px); background-size: 24px 24px; background-color: #fcfdfc; }
    .document-root { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 20px; }
    .document-node { padding: 18px; border: 1px solid #e3e9e3; border-radius: 16px; background: #ffffff; box-shadow: 0 12px 24px rgba(12,58,39,0.04); }
    .document-node__header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 999px; background: #fb4f4f; }
    .document-node p, .document-node li { color: #5f5f5f; font-size: 14px; line-height: 1.5; }
    .visual-section { margin-top: 28px; padding-top: 24px; border-top: 1px solid rgba(12,58,39,0.1); }
    .visual-section__header { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
    .visual-section__header h2 { margin: 0; font-size: 18px; }
    .feature-flow { overflow-x: auto; padding-bottom: 12px; }
    .feature-flow__columns { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(220px,1fr); gap: 48px; min-width: max-content; }
    .feature-flow__column { display: flex; flex-direction: column; gap: 18px; }
    .feature-flow__column-title { align-self: flex-start; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,0.92); color: #5c665f; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; }
    .flow-node { padding: 14px 16px; border-radius: 14px; background: rgba(255,255,255,0.96); box-shadow: 0 10px 20px rgba(12,58,39,0.05); }
    .flow-node--primary { border: 1px solid rgba(0,105,77,0.35); }
    .flow-node--secondary { border: 1px solid rgba(120,192,70,0.5); }
    .flow-node--neutral { border: 1px solid rgba(194,214,190,0.95); }
    .html-edge-list h3 { margin: 0 0 12px; font-size: 15px; }
    .policy-table-wrap { overflow-x: auto; border: 1px solid #dfe6de; border-radius: 16px; background: rgba(255,255,255,0.95); }
    .policy-table { width: 100%; min-width: 900px; border-collapse: separate; border-spacing: 0; font-size: 13px; }
    .policy-table th { padding: 12px 14px; border-bottom: 1px solid #d8dfd7; background: #f3f7f3; color: #33423a; text-align: left; white-space: nowrap; }
    .policy-table td { padding: 12px 14px; border-bottom: 1px solid #edf1ec; color: #55645a; vertical-align: top; line-height: 1.5; }
    .html-flow-chart { overflow-x: auto; padding: 8px 0 12px; }
    .html-flow-chart__board { display: grid; column-gap: 72px; row-gap: 28px; width: max-content; min-width: 100%; align-items: center; padding: 10px 18px 28px; }
    .html-flow-node { position: relative; display: flex; align-items: center; justify-content: center; min-height: 120px; justify-self: center; }
    .html-flow-node__content { position: relative; z-index: 1; width: 220px; min-height: 84px; padding: 18px; text-align: center; background: rgba(255,255,255,0.96); box-shadow: 0 10px 24px rgba(12,58,39,0.05); }
    .html-flow-node__content strong { display: block; font-size: 14px; line-height: 1.45; color: #2d3b34; }
    .html-flow-node__content p { margin: 8px 0 0; color: #66756b; font-size: 12px; line-height: 1.45; }
    .html-flow-node--process .html-flow-node__content { border: 1.5px solid #cfd6dc; border-radius: 6px; }
    .html-flow-node--terminator .html-flow-node__content { border: 1.5px solid #cfd6dc; border-radius: 999px; }
    .html-flow-node--document .html-flow-node__content { border: 1.5px solid #cfd6dc; clip-path: polygon(12% 0, 100% 0, 88% 100%, 0 100%); }
    .html-flow-node--subprocess .html-flow-node__content { border: 1.5px solid #cfd6dc; border-radius: 6px; box-shadow: inset 9px 0 0 rgba(154,171,185,0.18), inset -9px 0 0 rgba(154,171,185,0.18), 0 10px 24px rgba(12,58,39,0.05); }
    .html-flow-node--decision .html-flow-node__content { width: 196px; min-height: 130px; padding: 26px 28px; border: 1.5px solid #cfd6dc; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); display: flex; flex-direction: column; justify-content: center; }
    .html-flow-node--primary .html-flow-node__content { border-color: rgba(0,105,77,0.34); }
    .html-flow-node--secondary .html-flow-node__content { border-color: rgba(120,192,70,0.55); }
    .html-flow-node--neutral .html-flow-node__content { border-color: #cfd6dc; }
    .tree-map { overflow-x: auto; padding: 16px 8px 20px; }
    .tree-branch { display: flex; align-items: stretch; gap: 40px; min-width: max-content; }
    .tree-branch__self { position: relative; display: flex; align-items: center; min-width: 220px; }
    .tree-branch__children { position: relative; display: flex; flex-direction: column; justify-content: center; gap: 20px; padding-left: 24px; }
    .tree-branch__children::before { content: ""; position: absolute; top: 0; bottom: 0; left: 0; border-left: 1px solid rgba(92,102,95,0.35); }
    .tree-branch__children > .tree-branch { position: relative; }
    .tree-branch__children > .tree-branch::before { content: ""; position: absolute; top: 50%; left: -24px; width: 24px; border-top: 1px solid rgba(92,102,95,0.35); }
    .tree-node { min-width: 200px; max-width: 260px; padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,0.96); box-shadow: 0 8px 18px rgba(12,58,39,0.05); }
    .tree-node strong { display: block; font-size: 14px; }
    .tree-node p { margin: 6px 0 0; color: #66756b; font-size: 12px; line-height: 1.45; }
    .tree-node--primary { border: 1px solid rgba(111,77,241,0.25); color: #5b34d2; background: rgba(111,77,241,0.06); }
    .tree-node--secondary { border: 1px solid rgba(0,105,77,0.25); color: #00694d; background: rgba(0,105,77,0.06); }
    .tree-node--neutral { border: 1px solid rgba(194,214,190,0.9); color: #33423a; }
    .screen-spec-export { display: flex; flex-direction: column; gap: 24px; }
    .screen-spec-export__sheet { padding: 22px; border: 1px solid #dfe6de; border-radius: 20px; background: #ffffff; }
    .screen-spec-export__meta { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 10px; margin-bottom: 18px; }
    .screen-spec-export__meta-item { padding: 12px; border: 1px solid #edf1ec; border-radius: 12px; background: #fbfbfb; }
    .screen-spec-export__meta-item span { display: block; margin-bottom: 6px; color: #777777; font-size: 12px; }
    .screen-spec-export__meta-item strong { color: #262626; font-size: 13px; }
    .screen-spec-export__layout { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(320px,0.8fr); gap: 18px; margin-bottom: 18px; }
    .screen-spec-export__image-panel, .screen-spec-export__side { padding: 16px; border: 1px solid #edf1ec; border-radius: 16px; background: #ffffff; }
    .screen-spec-export__image-wrap { position: relative; overflow: hidden; border-radius: 14px; border: 1px solid #dfe6de; background: #f8fbf8; }
    .screen-spec-export__image { display: block; width: 100%; height: auto; }
    .screen-spec-export__marker { position: absolute; width: 28px; height: 28px; border-radius: 999px; background: #00694d; color: #ffffff; font-size: 12px; font-weight: 700; line-height: 28px; text-align: center; transform: translate(-50%, -50%); }
    .screen-spec-export__side { display: flex; flex-direction: column; gap: 12px; }
    .screen-spec-export__card { padding: 14px; border: 1px solid #edf1ec; border-radius: 14px; background: #fbfbfb; }
    .screen-spec-export__card strong { display: block; margin-bottom: 8px; font-size: 13px; }
    .screen-spec-export__card p, .screen-spec-export__card li { color: #5f5f5f; font-size: 12px; line-height: 1.5; }
    .screen-spec-export__card ul { margin: 0; padding-left: 18px; }
    .screen-spec-export__tables { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px; }
    .screen-spec-export__table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .screen-spec-export__table th, .screen-spec-export__table td { padding: 10px 12px; border-bottom: 1px solid #edf1ec; text-align: left; vertical-align: top; line-height: 1.5; }
    .screen-spec-export__table th { background: #f3f7f3; color: #33423a; }
  `;

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(document.title)}</title>
    <style>${styles}</style>
  </head>
  <body>
    ${getBoardPanelHtml(document)}
  </body>
</html>`;
}

function getExportDocuments(): Array<{ key: ExportableArtifactKey; filename: string; document: ArtifactDocument }> {
  return [
    { key: "prd", filename: "01-prd.html", document: artifacts.value.prd },
    { key: "featureSpec", filename: "02-feature-spec.html", document: artifacts.value.featureSpec },
    { key: "policySpec", filename: "03-policy-spec.html", document: artifacts.value.policySpec },
    { key: "userFlow", filename: "04-user-flow.html", document: artifacts.value.userFlow },
    { key: "flowChart", filename: "05-flow-chart.html", document: artifacts.value.flowChart },
    { key: "screenSpec", filename: "06-screen-spec.html", document: artifacts.value.screenSpec }
  ];
}

async function downloadHtmlArchive() {
  const zip = new JSZip();

  for (const item of getExportDocuments()) {
    zip.file(item.filename, buildStandaloneHtml(item.document));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const exportName = currentProject.value?.name ?? projectNameInput.value;
  const sanitizedWorkspaceName = exportName.trim().replace(/[\\/:*?"<>|]+/g, "-") || "workspace";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizedWorkspaceName}-html-export.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}

onMounted(() => {
  void loadProjects();
});
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand__mark">MP</div>
        <div>
          <strong>Momos Plan Studio</strong>
          <p>AI 기반 기획 산출물 워크스페이스</p>
        </div>
      </div>

      <nav class="tabs">
        <button
          v-for="item in tabItems"
          :key="item.key"
          :class="['tab', { 'tab--active': activeTab === item.key }]"
          @click="activeTab = item.key"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="topbar__actions">
        <button class="secondary-button" @click="createProject">+ 새 프로젝트</button>
        <button class="secondary-button" @click="isHistoryOpen = !isHistoryOpen">기존 프로젝트 불러오기</button>
        <button class="avatar-group" @click="isHistoryOpen = !isHistoryOpen">
          <!-- <span />
          <span /> -->
          <span />
        </button>
      </div>
    </header>

    <div class="export-toolbar">
      <div class="export-toolbar__inner">
        <button class="secondary-button" @click="downloadMarkdown">MD</button>
        <button class="secondary-button" @click="downloadPdf">PDF</button>
        <button class="secondary-button" @click="downloadImage">PNG</button>
        <button class="secondary-button" @click="downloadHtmlArchive">HTML</button>
      </div>
    </div>

    <main :class="['workspace', { 'workspace--history-open': isHistoryOpen }]">
      <aside class="chat-panel">
        <div class="chat-panel__card">
          <span class="label">프로젝트명</span>
          <input v-model="projectNameInput" class="text-input" placeholder="새 프로젝트명을 입력하세요" />
          <p class="project-caption">
            {{
              currentProject
                ? `현재 프로젝트: ${currentProject.name} · 도메인: ${currentProject.domainType ?? selectedDomainLabel}`
                : "아직 선택된 프로젝트가 없습니다."
            }}
          </p>
        </div>

        <div class="chat-panel__hint">
          프로젝트별로 PRD·기능명세서·정책서·유저플로우·흐름도차트·화면기획서를 누적 저장하고, 이후 요청으로 계속 개선할 수 있습니다.
        </div>

        <section class="chat-panel__card">
          <h2>요청 입력</h2>
          <p>업무 목적, 대상 고객, 제약조건을 포함하면 더 정교한 결과를 생성합니다. 생성 시 이전 프로젝트 문서와 로그가 함께 반영됩니다.</p>
          <div class="domain-field">
            <span class="label">도메인 유형</span>
            <select v-model="selectedDomainPreset" class="text-input domain-select">
              <option value="general">{{ domainPresetLabels.general }}</option>
              <option v-for="option in domainPresetOptions" :key="option" :value="option">
                {{ domainPresetLabels[option] }}
              </option>
              <option value="custom">{{ domainPresetLabels.custom }}</option>
            </select>
            <input
              v-if="selectedDomainPreset === 'custom'"
              v-model="customDomainType"
              class="text-input"
              placeholder="예: 공공행정, 부동산, 여행"
            />
            <p class="domain-caption">선택된 도메인 기준으로 지식 계층을 구성해 PRD부터 흐름도까지 반영합니다.</p>
          </div>
          <div class="screen-inputs">
            <div class="screen-inputs__header">
              <div>
                <span class="label">화면기획서 입력</span>
                <p>화면 이미지와 메타를 넣으면 마지막 산출물인 화면기획서에 반영됩니다.</p>
              </div>
              <button class="secondary-button" type="button" @click="addScreenInput">+ 화면 추가</button>
            </div>
            <div v-if="screenInputs.length === 0" class="screen-inputs__empty">
              아직 등록된 화면이 없습니다. 필요하면 화면을 추가해 이미지와 메타를 입력해 주세요.
            </div>
            <article
              v-for="(screen, index) in screenInputs"
              :key="`${screen.screenId}-${index}`"
              class="screen-input-card"
            >
              <div class="screen-input-card__header">
                <strong>화면 {{ index + 1 }}</strong>
                <button class="screen-input-card__remove" type="button" @click="removeScreenInput(index)">삭제</button>
              </div>
              <div class="screen-input-grid">
                <input v-model="screenInputs[index].screenId" class="text-input" placeholder="화면 ID" />
                <input v-model="screenInputs[index].screenName" class="text-input" placeholder="화면명" />
                <input v-model="screenInputs[index].route" class="text-input" placeholder="경로" />
                <input v-model="screenInputs[index].systemName" class="text-input" placeholder="시스템명" />
                <input v-model="screenInputs[index].author" class="text-input" placeholder="작성자" />
                <input
                  class="text-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  @change="(event) => handleScreenImageUpload(event, index)"
                />
              </div>
              <textarea
                v-model="screenInputs[index].notes"
                class="screen-notes-input"
                placeholder="화면 설명 메모, 리뷰 포인트, 참고 사항"
              />
              <div v-if="screen.imageDataUrl" class="screen-preview">
                <img :src="screen.imageDataUrl" :alt="screen.screenName || `screen-${index + 1}`" />
              </div>
            </article>
          </div>
          <textarea v-model="prompt" class="prompt-input" />
          <button
            class="primary-button"
            :disabled="primaryGenerateDisabled"
            @click="() => generateArtifacts(activeTab === 'screenSpec' ? 'screenSpec' : undefined)"
          >
            {{ primaryGenerateButtonLabel }}
          </button>
          <p v-if="activeTab === 'screenSpec' && !canGenerateScreenSpec" class="helper-text">
            화면기획서는 먼저 `PRD`, `기능명세서`, `정책서`, `유저플로우`, `흐름도차트`가 생성된 뒤 활성화됩니다.
          </p>
          <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        </section>

        <section class="chat-panel__card">
          <h3>누적 컨텍스트</h3>
          <p>{{ contextSummary }}</p>
        </section>

        <section class="chat-panel__card">
          <h3>추천 후속 요청</h3>
          <ul class="suggestion-list">
            <li v-for="suggestion in suggestedActions" :key="suggestion">
              <button class="suggestion-chip" @click="prompt = suggestion">{{ suggestion }}</button>
            </li>
          </ul>
        </section>
      </aside>

      <section class="board-panel">
        <div class="board-toolbar">
          <div>
            <span class="label">현재 산출물</span>
            <h1>{{ currentDocument.title }}</h1>
            <p class="board-toolbar__project">
              {{ currentProject ? `${currentProject.name} 프로젝트 · ${currentProject.domainType ?? selectedDomainLabel} 도메인` : "프로젝트를 먼저 선택해 주세요." }}
            </p>
          </div>
          <div class="board-meta">
            <span>{{ currentDocument.version }}</span>
            <span>{{ new Date(currentDocument.generatedAt).toLocaleString("ko-KR") }}</span>
            <button
              class="secondary-button"
              :disabled="isGenerating || (activeTab === 'screenSpec' && !canGenerateScreenSpec)"
              @click="() => generateArtifacts(activeTab)"
            >
              {{
                isGenerating
                  ? "재생성 중..."
                  : activeTab === "screenSpec"
                    ? "화면기획서 생성/재생성"
                    : "현재 문서부터 재생성"
              }}
            </button>
          </div>
        </div>

        <div ref="boardRef" class="document-board">
          <div class="document-root">
            <div
              v-for="section in currentDocument.sections"
              :key="section.title"
              class="document-node"
            >
              <div class="document-node__header">
                <span class="dot" />
                <strong>{{ section.title }}</strong>
              </div>
              <p>{{ section.summary }}</p>
              <ul>
                <li v-for="bullet in section.bullets" :key="bullet">{{ bullet }}</li>
              </ul>
            </div>
          </div>

          <section v-if="featureFlowVisualization" class="visual-section">
            <div class="visual-section__header">
              <div>
                <span class="label">추가 시각화</span>
                <h2>기능 플로우 그래프</h2>
              </div>
              <p>기능명세서 하단에 좌측에서 우측으로 확장되는 구조형 그래프를 함께 제공합니다.</p>
            </div>

            <FeatureFlowBoard :visualization="featureFlowVisualization" />
          </section>

          <section v-if="policyTableVisualization" class="visual-section">
            <div class="visual-section__header">
              <div>
                <span class="label">추가 시각화</span>
                <h2>{{ policyTableVisualization.title }}</h2>
              </div>
              <p>정책 정의서는 AI가 요구사항에 맞춘 컬럼 구조를 동적으로 생성하는 테이블 형식으로 제공합니다.</p>
            </div>

            <div class="policy-table-wrap">
              <table class="policy-table">
                <thead>
                  <tr>
                    <th
                      v-for="column in policyTableVisualization.columns"
                      :key="column.key"
                    >
                      {{ column.label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in policyTableVisualization.rows"
                    :key="row.id"
                  >
                    <td
                      v-for="column in policyTableVisualization.columns"
                      :key="`${row.id}-${column.key}`"
                    >
                      {{ row.values[column.key] ?? "-" }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section v-if="userFlowVisualization" class="visual-section">
            <div class="visual-section__header">
              <div>
                <span class="label">추가 시각화</span>
                <h2>{{ userFlowVisualization.title }}</h2>
              </div>
              <p>유저플로우 하단에 IA 스타일의 메뉴 구조 보드를 함께 생성합니다.</p>
            </div>

            <UserFlowBoard :visualization="userFlowVisualization" />
          </section>

          <section v-if="flowChartVisualization" class="visual-section">
            <div class="visual-section__header">
              <div>
                <span class="label">추가 시각화</span>
                <h2>{{ flowChartVisualization.title }}</h2>
              </div>
              <p>흐름도차트는 메인 흐름이 위에서 아래로 이어지고, 조건 분기는 좌우로 나뉘는 수직형 프로세스 다이어그램으로 제공합니다.</p>
            </div>

            <FlowChartBoard :visualization="flowChartVisualization" />
          </section>

          <section v-if="screenSpecVisualization" class="visual-section">
            <div class="visual-section__header">
              <div>
                <span class="label">추가 시각화</span>
                <h2>{{ screenSpecVisualization.title }}</h2>
              </div>
              <p>업로드한 화면 이미지와 기존 산출물을 연결한 화면정의서 형태의 보드입니다.</p>
            </div>

            <ScreenSpecBoard :visualization="screenSpecVisualization" />
          </section>
        </div>
      </section>

      <aside :class="['history-panel', { 'history-panel--open': isHistoryOpen }]">
        <div class="history-panel__header">
          <div>
            <span class="label">프로젝트 로그</span>
            <h3>기존 프로젝트 불러오기</h3>
          </div>
          <button class="secondary-button" @click="isHistoryOpen = false">닫기</button>
        </div>
        <div class="history-list">
          <article
            v-for="project in projectList"
            :key="project.id"
            :class="['history-card', { 'history-card--active': currentProject?.id === project.id }]"
            @click="selectProject(project.id)"
          >
            <strong>{{ project.name }}</strong>
            <span>{{ new Date(project.updatedAt).toLocaleDateString("ko-KR") }}</span>
            <p>{{ project.contextSummary ?? project.lastPrompt ?? "아직 생성 이력이 없습니다." }}</p>
          </article>
        </div>
        <div class="history-panel__header history-panel__header--nested">
          <div>
            <span class="label">최근 생성 로그</span>
            <h3>{{ currentProject?.name ?? "선택된 프로젝트 없음" }}</h3>
          </div>
        </div>
        <div class="history-list">
          <article v-for="log in projectLogs" :key="log.sessionId" class="history-card">
            <strong>{{ log.targetArtifact ? `${log.targetArtifact}부터 재생성` : "전체 문서 생성" }}</strong>
            <span>{{ new Date(log.createdAt).toLocaleString("ko-KR") }}</span>
            <p>{{ log.summary }}</p>
          </article>
        </div>
        <div class="history-panel__header history-panel__header--nested">
          <div>
            <span class="label">현재 탭 버전</span>
            <h3>{{ tabItems.find((item) => item.key === activeTab)?.label }}</h3>
          </div>
        </div>
        <div class="history-list">
          <article
            v-for="version in artifactVersions[activeTab]"
            :key="version.id"
            class="history-card"
          >
            <strong>{{ version.version }}</strong>
            <span>{{ new Date(version.generatedAt).toLocaleString("ko-KR") }}</span>
            <p>{{ version.title }}</p>
          </article>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.shell {
  max-width: 1480px;
  margin: 0 auto;
  padding: 18px 24px 24px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: grid;
  grid-template-columns: 280px 1fr auto;
  align-items: center;
  gap: 24px;
  height: 80px;
  padding: 0 20px;
  border: 1px solid rgba(194, 214, 190, 0.7);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #777777;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #00694d, #00ad50);
  color: #ffffff;
  font-weight: 700;
}

.tabs {
  display: flex;
  justify-content: center;
  gap: 8px;
  font-size:14px;
}

.tab {
  min-width: 80px;
  height: 40px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #777777;
}

.tab--active {
  color: #262626;
  border-bottom-color: #00ad50;
  font-weight: 700;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.export-toolbar {
  margin-top: 12px;
  padding: 5px 16px;
  
}

.export-toolbar__inner {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.workspace {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 20px;
  margin-top: 20px;
  align-items: start;
}

.workspace--history-open {
  grid-template-columns: 320px minmax(0, 1fr) 320px;
}

.chat-panel,
.board-panel,
.history-panel {
  min-height: calc(100vh - 150px);
}

.chat-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-panel__card,
.chat-panel__hint,
.history-card {
  border: 1px solid #e8ece8;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: 0 12px 32px rgba(12, 58, 39, 0.05);
}

.chat-panel__card {
  padding: 18px;
}

.chat-panel__card h2,
.chat-panel__card h3,
.visual-section__header h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.chat-panel__card p,
.visual-section__header p {
  margin: 0 0 14px;
  color: #777777;
  font-size: 14px;
}

.chat-panel__hint {
  padding: 18px;
  color: #5c665f;
  font-size: 14px;
}

.project-caption,
.board-toolbar__project {
  margin: 10px 0 0;
  color: #5c665f;
  font-size: 13px;
  line-height: 1.5;
}

.domain-field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}

.domain-select {
  appearance: none;
  padding-right: 40px;
  background-image:
    linear-gradient(45deg, transparent 50%, #5c665f 50%),
    linear-gradient(135deg, #5c665f 50%, transparent 50%);
  background-position:
    calc(100% - 18px) calc(50% - 2px),
    calc(100% - 12px) calc(50% - 2px);
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
}

.domain-caption {
  margin: 0;
  color: #5c665f;
  font-size: 12px;
  line-height: 1.5;
}

.screen-inputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
}

.screen-inputs__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.screen-inputs__header > div {
  width: 170px;
  display: flex;
  flex-direction: column;
}

.screen-inputs__header > button {
  height: 29px;
  padding: 0 10px;
  background: #f4f4f4;
  font-size: 12px;
}

.screen-inputs__header p,
.screen-inputs__empty {
  color: #777777;
  font-size: 12px;
  line-height: 1.5;
}

.screen-input-card {
  padding: 14px;
  border: 1px solid #e8ece8;
  border-radius: 14px;
  background: #fbfbfb;
}

.screen-input-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.screen-input-card__remove {
  border: 0;
  background: transparent;
  color: #fb4f4f;
  font-size: 12px;
}

.screen-input-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.screen-notes-input {
  width: 100%;
  min-height: 72px;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid #d9ded9;
  border-radius: 6px;
  background: #ffffff;
  resize: vertical;
  font-size: 13px;
}

.screen-notes-input:focus {
  outline: none;
  border-color: #00ad50;
}

.screen-preview {
  margin-top: 10px;
  overflow: hidden;
  border: 1px solid #dfe6de;
  border-radius: 12px;
  background: #ffffff;
}

.screen-preview img {
  display: block;
  width: 100%;
  height: auto;
}

.label {
  display: inline-block;
  margin-bottom: 6px;
  color: #777777;
  font-size: 12px;
  font-weight: 600;
}

.text-input,
.prompt-input {
  width: 100%;
  border: 1px solid #d9ded9;
  border-radius: 6px;
  background: #ffffff;
  transition: border-color 0.2s ease;
}

.text-input {
  height: 40px;
  padding: 0 12px;
}

.prompt-input {
  min-height: 180px;
  padding: 14px;
  resize: vertical;
  font-size: 14px;
}

.text-input:focus,
.prompt-input:focus {
  outline: none;
  border-color: #00ad50;
}

.primary-button,
.secondary-button {
  height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  font-size:13px;
  transition: all 0.2s ease;
}

.primary-button {
  width: 100%;
  border: 0;
  background: #00694d;
  color: #ffffff;
  font-weight: 400;
}

.primary-button:disabled {
  background: #9eb4aa;
  cursor: not-allowed;
}

.secondary-button {
  border: 1px solid #d9ded9;
  background: #ffffff;
  color: #262626;
}

.avatar-group {
  display: flex;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
}

.avatar-group span {
  width: 28px;
  height: 28px;
  border: 1px solid #ffffff;
  border-radius: 999px;
  background: linear-gradient(135deg, #c2d6be, #ffffff);
}

.avatar-group span:nth-child(2) {
  margin-left: -10px;
  background: linear-gradient(135deg, #b9d3ff, #ffffff);
}

.avatar-group span:nth-child(3) {
  margin-left: -10px;
  background: linear-gradient(135deg, #efe0b9, #ffffff);
}

.suggestion-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.suggestion-chip {
  border: 1px solid #d9ded9;
  border-radius: 999px;
  padding: 8px 12px;
  background: #ffffff;
  font-size:12px;
}

.error-text {
  margin-top: 10px;
  color: #fb4f4f;
}

.helper-text {
  margin-top: 10px;
  color: #5c665f;
  font-size: 12px;
  line-height: 1.5;
}

.board-panel {
  padding: 22px;
  border: 1px solid #e8ece8;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 20px 50px rgba(12, 58, 39, 0.08);
}

.board-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.board-toolbar h1 {
  margin: 4px 0 0;
  font-size: 30px;
}

.board-meta {
  display: flex;
  gap: 12px;
  color: #777777;
  font-size: 13px;
  align-items: center;
}

.document-board {
  min-height: 720px;
  border-radius: 20px;
  padding: 28px;
  background-image:
    linear-gradient(rgba(0, 105, 77, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 105, 77, 0.06) 1px, transparent 1px);
  background-size: 24px 24px;
  background-color: #fcfdfc;
}

.document-root {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.document-node {
  position: relative;
  padding: 18px;
  border: 1px solid #e3e9e3;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(12, 58, 39, 0.04);
}

.document-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #fb4f4f;
  display:none;
}

.document-node p,
.document-node li {
  color: #5f5f5f;
  font-size: 14px;
}

.visual-section {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid rgba(12, 58, 39, 0.1);
}

.visual-section__header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.visual-section__header p {
  max-width: 420px;
  margin: 24px 0 0;
}

.feature-flow {
  position: relative;
  overflow-x: auto;
  padding: 12px 0 8px;
}

.feature-flow__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.feature-flow__path {
  fill: none;
  stroke: rgba(0, 105, 77, 0.28);
  stroke-width: 2;
}

.feature-flow__label {
  font-size: 11px;
  fill: #5f6d64;
  text-anchor: middle;
}

.feature-flow__columns {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(220px, 1fr);
  gap: 48px;
  min-width: max-content;
  padding: 10px 12px 24px;
}

.feature-flow__column {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

/* .feature-flow__column::before {
  content: "";
  position: absolute;
  top: 26px;
  bottom: 8px;
  left: 14px;
  border-left: 1px dashed rgba(0, 105, 77, 0.18);
} */

.feature-flow__column-title {
  position: relative;
  z-index: 1;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #5c665f;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.flow-node {
  position: relative;
  z-index: 1;
  margin-left: 18px;
  min-height: 72px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 20px rgba(12, 58, 39, 0.05);
}

.flow-node strong {
  display: block;
  margin-bottom: 8px;
  font-size: 15px;
}

.flow-node p {
  margin: 0;
  color: #66756b;
  font-size: 13px;
}

.flow-node--primary {
  border: 1px solid rgba(0, 105, 77, 0.35);
}

.flow-node--secondary {
  border: 1px solid rgba(120, 192, 70, 0.5);
}

.flow-node--neutral {
  border: 1px solid rgba(194, 214, 190, 0.95);
}

.policy-table-wrap {
  overflow-x: auto;
  border: 1px solid #dfe6de;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
}

.policy-table {
  width: 100%;
  min-width: 900px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.policy-table thead th {
  position: sticky;
  top: 0;
  padding: 12px 14px;
  border-bottom: 1px solid #d8dfd7;
  background: #f3f7f3;
  color: #33423a;
  text-align: left;
  white-space: nowrap;
}

.policy-table tbody td {
  padding: 12px 14px;
  border-bottom: 1px solid #edf1ec;
  color: #55645a;
  vertical-align: top;
  line-height: 1.5;
}

.policy-table tbody tr:last-child td {
  border-bottom: 0;
}

.history-panel {
  width: 0;
  overflow: hidden;
  opacity: 0;
  transition: all 0.25s ease;
}

.history-panel--open {
  width: 320px;
  opacity: 1;
}

.history-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.history-panel__header--nested {
  margin-top: 18px;
}

.history-panel__header h3 {
  margin: 4px 0 0;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-card {
  padding: 16px;
  cursor: pointer;
}

.history-card span {
  display: block;
  margin: 6px 0;
  color: #777777;
  font-size: 12px;
}

.history-card p {
  margin: 0;
  color: #777777;
  font-size: 14px;
}

.history-card--active {
  border-color: rgba(0, 105, 77, 0.3);
  background: rgba(0, 105, 77, 0.05);
}

@media (max-width: 1280px) {
  .workspace {
    grid-template-columns: 1fr;
  }

  .history-panel,
  .history-panel--open {
    width: 100%;
    opacity: 1;
  }

  .document-root {
    grid-template-columns: 1fr;
  }

  .feature-flow__column::before {
    display: none;
  }

  .visual-section__header,
  .topbar {
    grid-template-columns: 1fr;
    height: auto;
    padding: 16px;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { toPng } from "html-to-image";
import jsPDF from "jspdf";
import type { ArtifactDocument, GenerationResponse, HistoryItem, WorkspaceArtifactSet } from "@mottor-plan/shared";
import { api } from "./services/api";

type TabKey = "prd" | "featureSpec" | "userFlow";

const workspaceName = ref("홈페이지 리뉴얼 예약 보드");
const prompt = ref("외부 고객이 한 줄 아이디어만 입력하면 고품질 PRD, 기능명세서, 유저 플로우를 생성해줘");
const activeTab = ref<TabKey>("prd");
const isGenerating = ref(false);
const isHistoryOpen = ref(false);
const history = ref<HistoryItem[]>([]);
const boardRef = ref<HTMLElement | null>(null);
const errorMessage = ref("");

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
    ]
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
    ]
  }
};

const artifacts = ref<WorkspaceArtifactSet>(fallbackArtifacts);
const suggestedActions = ref<string[]>([
  "핵심 사용자군 3개를 정의해줘",
  "MVP 제외 범위를 따로 정리해줘",
  "유저 플로우를 운영자 기준으로 다시 써줘"
]);

const tabItems: Array<{ key: TabKey; label: string }> = [
  { key: "prd", label: "PRD" },
  { key: "featureSpec", label: "기능명세서" },
  { key: "userFlow", label: "유저플로우" }
];

const currentDocument = computed<ArtifactDocument>(() => {
  return artifacts.value[activeTab.value];
});

function buildFallbackResponse(): GenerationResponse {
  const normalized = prompt.value.trim();
  const title = normalized.length > 20 ? `${normalized.slice(0, 20)}...` : normalized;

  return {
    sessionId: crypto.randomUUID(),
    artifacts: {
      prd: {
        ...fallbackArtifacts.prd,
        title: `${title || "서비스"} PRD`,
        generatedAt: new Date().toISOString()
      },
      featureSpec: {
        ...fallbackArtifacts.featureSpec,
        title: `${title || "서비스"} 기능명세서`,
        generatedAt: new Date().toISOString()
      },
      userFlow: {
        ...fallbackArtifacts.userFlow,
        title: `${title || "서비스"} 유저플로우`,
        generatedAt: new Date().toISOString()
      }
    },
    suggestedActions: suggestedActions.value
  };
}

async function loadHistory() {
  try {
    history.value = await api.getHistory();
  } catch {
    history.value = [
      {
        id: "sample-1",
        title: "AI 기획 보조 워크스페이스",
        createdAt: new Date().toISOString(),
        summary: "문서 생성, 히스토리, 다운로드 기능이 포함된 초안"
      }
    ];
  }
}

async function generateArtifacts() {
  if (!prompt.value.trim()) {
    errorMessage.value = "아이디어를 한 줄 이상 입력해 주세요.";
    return;
  }

  isGenerating.value = true;
  errorMessage.value = "";

  try {
    const response = await api.generate({
      prompt: prompt.value,
      workspaceName: workspaceName.value
    });
    artifacts.value = response.artifacts;
    suggestedActions.value = response.suggestedActions;
    await loadHistory();
  } catch {
    const fallback = buildFallbackResponse();
    artifacts.value = fallback.artifacts;
    suggestedActions.value = fallback.suggestedActions;
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
    ])
  ].join("\n");
}

function downloadMarkdown() {
  downloadText(`${currentDocument.value.title}.md`, formatDocument(currentDocument.value), "text/markdown;charset=utf-8");
}

async function downloadImage() {
  if (!boardRef.value) {
    return;
  }

  const dataUrl = await toPng(boardRef.value, {
    cacheBust: true,
    pixelRatio: 2
  });

  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = `${currentDocument.value.title}.png`;
  anchor.click();
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

onMounted(() => {
  loadHistory();
});
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand__mark">MP</div>
        <div>
          <strong>Mottor Plan Studio</strong>
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
        <button class="secondary-button" @click="downloadMarkdown">MD</button>
        <button class="secondary-button" @click="downloadPdf">PDF</button>
        <button class="secondary-button" @click="downloadImage">PNG</button>
        <button class="avatar-group" @click="isHistoryOpen = !isHistoryOpen">
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>

    <main class="workspace">
      <aside class="chat-panel">
        <div class="chat-panel__card">
          <span class="label">프로젝트명</span>
          <input v-model="workspaceName" class="text-input" />
        </div>

        <div class="chat-panel__hint">
          외부 고객은 아이디어 한 줄만 입력하고, 우측에서 PRD·기능명세서·유저 플로우를 바로 검토합니다.
        </div>

        <section class="chat-panel__card">
          <h2>요청 입력</h2>
          <p>업무 목적, 대상 고객, 제약조건을 포함하면 더 정교한 결과를 생성합니다.</p>
          <textarea v-model="prompt" class="prompt-input" />
          <button class="primary-button" :disabled="isGenerating" @click="generateArtifacts">
            {{ isGenerating ? "생성 중..." : "문서 생성" }}
          </button>
          <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
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
          </div>
          <div class="board-meta">
            <span>{{ currentDocument.version }}</span>
            <span>{{ new Date(currentDocument.generatedAt).toLocaleString("ko-KR") }}</span>
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
        </div>
      </section>

      <aside :class="['history-panel', { 'history-panel--open': isHistoryOpen }]">
        <div class="history-panel__header">
          <div>
            <span class="label">생성 히스토리</span>
            <h3>최근 생성 결과</h3>
          </div>
          <button class="secondary-button" @click="isHistoryOpen = false">닫기</button>
        </div>
        <div class="history-list">
          <article v-for="item in history" :key="item.id" class="history-card">
            <strong>{{ item.title }}</strong>
            <span>{{ new Date(item.createdAt).toLocaleDateString("ko-KR") }}</span>
            <p>{{ item.summary }}</p>
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
}

.tab {
  min-width: 120px;
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

.workspace {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 0;
  gap: 20px;
  margin-top: 20px;
  align-items: start;
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
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 32px rgba(12, 58, 39, 0.05);
}

.chat-panel__card {
  padding: 18px;
}

.chat-panel__card h2,
.chat-panel__card h3 {
  margin: 0 0 8px;
  font-size: 18px;
}

.chat-panel__card p {
  margin: 0 0 14px;
  color: #777777;
  font-size: 14px;
}

.chat-panel__hint {
  padding: 18px;
  color: #5c665f;
  font-size: 14px;
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
  border-radius: 14px;
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
  transition: all 0.2s ease;
}

.primary-button {
  width: 100%;
  border: 0;
  background: #00694d;
  color: #ffffff;
  font-weight: 700;
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
}

.error-text {
  margin-top: 10px;
  color: #fb4f4f;
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
  align-items: end;
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
}

.document-node p,
.document-node li {
  color: #5f5f5f;
  font-size: 14px;
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

  .topbar {
    grid-template-columns: 1fr;
    height: auto;
    padding: 16px;
  }
}
</style>

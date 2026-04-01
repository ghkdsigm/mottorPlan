<script setup lang="ts">
import type { ScreenSpecVisualization } from "@mottor-plan/shared";

defineProps<{
  visualization: ScreenSpecVisualization;
}>();
</script>

<template>
  <div class="screen-spec-board">
    <article
      v-for="screen in visualization.screens"
      :key="screen.id"
      class="screen-spec-slide"
    >
      <div class="screen-spec-slide__page">
        <header class="screen-spec-slide__meta-table">
          <div class="meta-table__cell meta-table__cell--wide">
            <span>Project</span>
            <strong>{{ screen.systemName || visualization.title }}</strong>
          </div>
          <div class="meta-table__cell">
            <span>Page Code</span>
            <strong>{{ screen.screenId }}</strong>
          </div>
          <div class="meta-table__cell">
            <span>Date</span>
            <strong>{{ screen.createdDate || "-" }}</strong>
          </div>
          <div class="meta-table__cell">
            <span>Author</span>
            <strong>{{ screen.author || "-" }}</strong>
          </div>
          <div class="meta-table__cell meta-table__cell--wide">
            <span>Page Name</span>
            <strong>{{ screen.screenName }}</strong>
          </div>
          <div class="meta-table__cell meta-table__cell--wide">
            <span>Page Path</span>
            <strong>{{ screen.route || "-" }}</strong>
          </div>
          <div class="meta-table__cell meta-table__cell--wide">
            <span>Description</span>
            <strong>{{ screen.notes || "업로드한 화면을 기준으로 주요 기능과 정책을 정리합니다." }}</strong>
          </div>
        </header>

        <div class="screen-spec-slide__body">
          <section class="screen-spec-stage">
            <div class="screen-spec-stage__header">
              <div>
                <span class="screen-spec-label">Screen Draft</span>
                <h3>{{ screen.screenName }}</h3>
              </div>
              <div class="screen-spec-stage__chips">
                <span>{{ screen.screenId }}</span>
                <span v-if="screen.route">{{ screen.route }}</span>
              </div>
            </div>

            <div class="screen-spec-stage__canvas">
              <div class="screen-spec-stage__frame">
                <div class="screen-spec-stage__image-wrap">
                  <img
                    :src="screen.imageDataUrl"
                    :alt="screen.screenName"
                    class="screen-spec-stage__image"
                  />
                  <span
                    v-for="marker in screen.markers"
                    :key="marker.id"
                    class="screen-spec-stage__marker"
                    :style="{ left: `${marker.x}%`, top: `${marker.y}%` }"
                  >
                    {{ marker.number }}
                  </span>
                </div>
              </div>
            </div>

            <div class="screen-spec-stage__footer">
              <div class="screen-spec-stage__summary">
                <span>화면 수</span>
                <strong>1</strong>
              </div>
              <div class="screen-spec-stage__summary">
                <span>포인트</span>
                <strong>{{ screen.markers.length }}</strong>
              </div>
              <div class="screen-spec-stage__summary">
                <span>정의 섹션</span>
                <strong>{{ screen.descriptionSections.length }}</strong>
              </div>
            </div>
          </section>

          <aside class="screen-spec-side">
            <section class="screen-spec-side__panel screen-spec-side__panel--description">
              <div class="screen-spec-side__header">
                <div>
                  <span class="screen-spec-label">Description</span>
                  <h4>기능 설명</h4>
                </div>
                <strong>{{ screen.markers.length }}</strong>
              </div>

              <div class="screen-spec-description-list">
                <article
                  v-for="marker in screen.markers"
                  :key="`${screen.id}-${marker.id}`"
                  class="screen-spec-description-row"
                >
                  <div class="screen-spec-description-row__index">
                    {{ marker.number }}
                  </div>
                  <div class="screen-spec-description-row__content">
                    <strong>{{ marker.title }}</strong>
                    <p>{{ marker.description || "-" }}</p>
                  </div>
                </article>

                <article
                  v-if="screen.markers.length === 0"
                  class="screen-spec-description-row screen-spec-description-row--empty"
                >
                  <div class="screen-spec-description-row__content">
                    <strong>설명 포인트 없음</strong>
                    <p>마커 정보가 생성되면 이 영역에 항목별 설명이 표시됩니다.</p>
                  </div>
                </article>
              </div>
            </section>

            <section class="screen-spec-side__panel screen-spec-side__panel--guide">
              <div class="screen-spec-side__header">
                <div>
                  <span class="screen-spec-label">Guide</span>
                  <h4>추가 정의</h4>
                </div>
              </div>

              <div class="screen-spec-guide">
                <p v-if="screen.notes" class="screen-spec-guide__note">
                  {{ screen.notes }}
                </p>

                <article
                  v-for="section in screen.descriptionSections"
                  :key="section.id"
                  class="screen-spec-guide__card"
                >
                  <strong>{{ section.title }}</strong>
                  <ul>
                    <li v-for="bullet in section.bullets" :key="bullet">{{ bullet }}</li>
                  </ul>
                </article>

                <article
                  v-if="!screen.notes && screen.descriptionSections.length === 0"
                  class="screen-spec-guide__card"
                >
                  <strong>추가 정의 없음</strong>
                  <p>생성된 메모 또는 가이드가 이 영역에 표시됩니다.</p>
                </article>
              </div>
            </section>

            <section class="screen-spec-side__panel screen-spec-side__panel--summary">
              <div class="screen-spec-summary-grid">
                <article class="screen-spec-summary-card">
                  <div class="screen-spec-summary-card__header">
                    <span class="screen-spec-label">Functional</span>
                    <strong>기능 정의</strong>
                  </div>
                  <ul>
                    <li
                      v-for="requirement in screen.functionalRequirements"
                      :key="requirement.id"
                    >
                      <strong>{{ requirement.no }}. {{ requirement.title }}</strong>
                      <span>{{ requirement.description }}</span>
                    </li>
                    <li v-if="screen.functionalRequirements.length === 0">
                      <span>정의된 기능이 없습니다.</span>
                    </li>
                  </ul>
                </article>

                <article class="screen-spec-summary-card">
                  <div class="screen-spec-summary-card__header">
                    <span class="screen-spec-label">Policies</span>
                    <strong>정책 연결</strong>
                  </div>
                  <ul>
                    <li v-for="policy in screen.policyReferences" :key="policy.id">
                      <strong>{{ policy.policyName }}</strong>
                      <span>{{ policy.summary }}</span>
                    </li>
                    <li v-if="screen.policyReferences.length === 0">
                      <span>연결된 정책이 없습니다.</span>
                    </li>
                  </ul>
                </article>

                <article class="screen-spec-summary-card">
                  <div class="screen-spec-summary-card__header">
                    <span class="screen-spec-label">Related</span>
                    <strong>연결 화면</strong>
                  </div>
                  <ul>
                    <li v-for="link in screen.relatedScreens" :key="link.id">
                      <strong>{{ link.label }}</strong>
                      <span>{{ link.description || link.targetScreenId || "-" }}</span>
                    </li>
                    <li v-if="screen.relatedScreens.length === 0">
                      <span>연결된 화면이 없습니다.</span>
                    </li>
                  </ul>
                </article>

                <article class="screen-spec-summary-card">
                  <div class="screen-spec-summary-card__header">
                    <span class="screen-spec-label">History</span>
                    <strong>수정 로그</strong>
                  </div>
                  <ul>
                    <li v-for="log in screen.changeLog" :key="log.id">
                      <strong>{{ log.date }}</strong>
                      <span>{{ log.description }}</span>
                    </li>
                    <li v-if="screen.changeLog.length === 0">
                      <span>수정 이력이 없습니다.</span>
                    </li>
                  </ul>
                </article>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.screen-spec-board {
  display: flex;
  flex-direction: column;
  gap: 40px;
  overflow-x: auto;
  padding: 8px 0 16px;
}

.screen-spec-slide {
  width:1920px;
  height: 1080px;
  min-width: 1120px;
}

.screen-spec-slide__page {
  width: min(1920px, 100%);
  aspect-ratio: 16 / 9;
  margin: 0 auto;
  padding: 22px;
  border: 1px solid #d9d9d9;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 246, 242, 0.96));
  box-shadow: 0 24px 60px rgba(20, 20, 20, 0.08);
}

.screen-spec-slide__meta-table {
  display: grid;
  grid-template-columns: 2.1fr 1fr 0.9fr 0.9fr;
  border: 1px solid #bcbcbc;
  background: #ffffff;
}

.meta-table__cell {
  min-height: 68px;
  padding: 10px 14px;
  border-right: 1px solid #bcbcbc;
  border-bottom: 1px solid #bcbcbc;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.meta-table__cell:nth-child(4n) {
  border-right: 0;
}

.meta-table__cell:nth-last-child(-n + 3) {
  border-bottom: 0;
}

.meta-table__cell--wide {
  grid-column: span 2;
}

.meta-table__cell span {
  color: #777777;
  font-size: 12px;
  font-weight: 600;
}

.meta-table__cell strong {
  color: #262626;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.45;
}

.screen-spec-slide__body {
  display: grid;
  grid-template-columns: minmax(0, 1.48fr) minmax(340px, 0.92fr);
  gap: 18px;
  height: calc(100% - 170px);
  margin-top: 18px;
}

.screen-spec-stage,
.screen-spec-side__panel {
  border: 1px solid #cfcfcf;
  background: #ffffff;
}

.screen-spec-stage {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
  padding: 18px;
}

.screen-spec-stage__header,
.screen-spec-side__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.screen-spec-label {
  display: inline-block;
  color: #777777;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.screen-spec-stage__header h3,
.screen-spec-side__header h4 {
  margin: 6px 0 0;
  color: #262626;
  font-size: 28px;
  font-weight: 700;
}

.screen-spec-side__header h4 {
  font-size: 18px;
}

.screen-spec-stage__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.screen-spec-stage__chips span {
  padding: 6px 10px;
  border: 1px solid #d8d8d8;
  background: #f5f5f5;
  color: #555555;
  font-size: 12px;
}

.screen-spec-stage__canvas {
  min-height: 0;
  padding: 22px;
  border: 1px solid #cfcfcf;
  background: #f3f3f1;
}

.screen-spec-stage__frame {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 28px;
  border: 1px solid #bdbdbd;
  background: #f7f7f7;
}

.screen-spec-stage__image-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 2px solid #aeb0b2;
  background: #ffffff;
}

.screen-spec-stage__image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.screen-spec-stage__marker {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: #1da9e8;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  transform: translate(-50%, -50%);
  box-shadow: 0 8px 18px rgba(29, 169, 232, 0.28);
}

.screen-spec-stage__footer {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.screen-spec-stage__summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid #d8d8d8;
  background: #fbfbfb;
}

.screen-spec-stage__summary span {
  color: #777777;
  font-size: 12px;
}

.screen-spec-stage__summary strong {
  color: #262626;
  font-size: 18px;
}

.screen-spec-side {
  display: grid;
  grid-template-rows: minmax(0, 1.1fr) minmax(0, 0.84fr) minmax(0, 1fr);
  gap: 14px;
  min-height: 0;
}

.screen-spec-side__panel {
  min-height: 0;
  padding: 16px;
}

.screen-spec-side__panel--description,
.screen-spec-side__panel--guide,
.screen-spec-summary-card {
  overflow: hidden;
}

.screen-spec-side__header strong {
  min-width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d8d8d8;
  background: #f7f7f7;
  color: #262626;
  font-size: 14px;
}

.screen-spec-description-list,
.screen-spec-guide,
.screen-spec-summary-card ul {
  min-height: 0;
  margin-top: 14px;
  overflow: auto;
}

.screen-spec-description-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.screen-spec-description-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid #e1e1e1;
}

.screen-spec-description-row:first-child {
  border-top: 0;
  padding-top: 0;
}

.screen-spec-description-row__index {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #1da9e8;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}

.screen-spec-description-row__content strong,
.screen-spec-guide__card strong,
.screen-spec-summary-card li strong {
  display: block;
  color: #262626;
  font-size: 14px;
  line-height: 1.5;
}

.screen-spec-description-row__content p,
.screen-spec-guide__note,
.screen-spec-guide__card li,
.screen-spec-guide__card p,
.screen-spec-summary-card li span {
  margin: 4px 0 0;
  color: #5f5f5f;
  font-size: 12px;
  line-height: 1.6;
}

.screen-spec-description-row--empty {
  grid-template-columns: 1fr;
}

.screen-spec-guide {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.screen-spec-guide__note {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid #d8d8d8;
  background: #f8f8f8;
}

.screen-spec-guide__card {
  padding: 12px 14px;
  border: 1px solid #dfdfdf;
  background: #fbfbfb;
}

.screen-spec-guide__card ul {
  margin: 8px 0 0;
  padding-left: 16px;
}

.screen-spec-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  height: 100%;
}

.screen-spec-summary-card {
  min-height: 0;
  padding: 14px;
  border: 1px solid #d8d8d8;
  background: #fbfbfb;
}

.screen-spec-summary-card__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.screen-spec-summary-card ul {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  list-style: none;
}

.screen-spec-summary-card li {
  padding-top: 10px;
  border-top: 1px solid #e3e3e3;
}

.screen-spec-summary-card li:first-child {
  border-top: 0;
  padding-top: 0;
}

@media (max-width: 1400px) {
  .screen-spec-slide {
    min-width: 1040px;
  }

  .screen-spec-slide__page {
    padding: 18px;
  }

  .screen-spec-stage__header h3 {
    font-size: 24px;
  }
}

@media (max-width: 1200px) {
  .screen-spec-slide {
    min-width: 960px;
  }

  .screen-spec-slide__body {
    grid-template-columns: minmax(0, 1.3fr) minmax(300px, 0.9fr);
  }
}
</style>

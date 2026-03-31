<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ComponentPublicInstance } from "vue";
import type { FlowChartVisualization } from "@mottor-plan/shared";

type FlowEdgePathTone = "positive" | "negative" | "neutral";

type FlowEdgePath = {
  id: string;
  d: string;
  label?: string;
  labelX: number;
  labelY: number;
  tone: FlowEdgePathTone;
};

const props = defineProps<{
  visualization: FlowChartVisualization;
}>();

const contentRef = ref<HTMLElement | null>(null);
const edgePaths = ref<FlowEdgePath[]>([]);
const svgWidth = ref(0);
const svgHeight = ref(0);
const nodeElements = new Map<string, HTMLElement>();
let resizeObserver: ResizeObserver | null = null;

const columnCount = computed(() => {
  const maxColumn = props.visualization.nodes.reduce((acc, node) => Math.max(acc, node.column), 0);
  return maxColumn + 1;
});

const rowCount = computed(() => {
  const maxRow = props.visualization.nodes.reduce((acc, node) => Math.max(acc, node.row), 0);
  return maxRow + 1;
});

function getBoardStyle() {
  return {
    gridTemplateColumns: `repeat(${columnCount.value}, minmax(220px, 260px))`,
    gridTemplateRows: `repeat(${rowCount.value}, minmax(140px, auto))`
  };
}

function getNodeStyle(column: number, row: number) {
  return {
    gridColumn: `${column + 1}`,
    gridRow: `${row + 1}`
  };
}

function getEdgeTone(label?: string): FlowEdgePathTone {
  const normalized = label?.trim().toLowerCase() ?? "";
  if (normalized.includes("yes") || normalized.includes("승인") || normalized.includes("완료") || normalized.includes("적합")) {
    return "positive";
  }

  if (normalized.includes("no") || normalized.includes("실패") || normalized.includes("불가") || normalized.includes("보완")) {
    return "negative";
  }

  return "neutral";
}

function setNodeRef(nodeId: string) {
  return (element: Element | ComponentPublicInstance | null) => {
    if (element instanceof HTMLElement) {
      nodeElements.set(nodeId, element);
      return;
    }

    nodeElements.delete(nodeId);
  };
}

function updateEdgePaths() {
  const content = contentRef.value;
  if (!content) {
    edgePaths.value = [];
    return;
  }

  svgWidth.value = Math.ceil(content.scrollWidth);
  svgHeight.value = Math.ceil(content.scrollHeight);
  const contentRect = content.getBoundingClientRect();
  const edgeLookup = new Set(props.visualization.edges.map((edge) => `${edge.from}::${edge.to}`));

  edgePaths.value = props.visualization.edges.flatMap((edge) => {
    const fromElement = nodeElements.get(edge.from);
    const toElement = nodeElements.get(edge.to);

    if (!fromElement || !toElement) {
      return [];
    }

    const fromRect = fromElement.getBoundingClientRect();
    const toRect = toElement.getBoundingClientRect();
    const fromCenterX = fromRect.left - contentRect.left + fromRect.width / 2;
    const fromCenterY = fromRect.top - contentRect.top + fromRect.height / 2;
    const toCenterX = toRect.left - contentRect.left + toRect.width / 2;
    const toCenterY = toRect.top - contentRect.top + toRect.height / 2;
    const deltaX = toCenterX - fromCenterX;
    const deltaY = toCenterY - fromCenterY;
    const tone = getEdgeTone(edge.label);
    const hasReverseEdge = edgeLookup.has(`${edge.to}::${edge.from}`);

    if (Math.abs(deltaY) >= Math.abs(deltaX)) {
      const moveDown = deltaY >= 0;
      const startX = fromCenterX;
      const startY = moveDown ? fromRect.bottom - contentRect.top : fromRect.top - contentRect.top;
      const endX = toCenterX;
      const endY = moveDown ? toRect.top - contentRect.top : toRect.bottom - contentRect.top;
      const midY = startY + (endY - startY) / 2;

      return [
        {
          id: `${edge.from}-${edge.to}`,
          d: `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`,
          label: edge.label,
          labelX: startX === endX ? startX + 12 : startX + (endX - startX) / 2,
          labelY: midY - 8,
          tone
        }
      ];
    }

    const moveRight = deltaX >= 0;
    const startX = moveRight ? fromRect.right - contentRect.left : fromRect.left - contentRect.left;
    const startY = fromCenterY;
    const endX = moveRight ? toRect.left - contentRect.left : toRect.right - contentRect.left;
    const endY = toCenterY;
    const midX = startX + (endX - startX) / 2;
    const isSameLane = Math.abs(endY - startY) < 6;

    if (hasReverseEdge && isSameLane) {
      const detourY = startY + (moveRight ? -26 : 26);

      return [
        {
          id: `${edge.from}-${edge.to}`,
          d: `M ${startX} ${startY} V ${detourY} H ${endX} V ${endY}`,
          label: edge.label,
          labelX: startX + (endX - startX) / 2,
          labelY: detourY + (moveRight ? -8 : 18),
          tone
        }
      ];
    }

    return [
      {
        id: `${edge.from}-${edge.to}`,
        d: `M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`,
        label: edge.label,
        labelX: midX + 8,
        labelY: startY === endY ? startY - 10 : startY + (endY - startY) / 2 - 8,
        tone
      }
    ];
  });
}

function scheduleUpdate() {
  void nextTick().then(() => {
    updateEdgePaths();
  });
}

function handleResize() {
  updateEdgePaths();
}

watch(
  () => props.visualization,
  () => {
    scheduleUpdate();
  },
  { deep: true }
);

onMounted(() => {
  window.addEventListener("resize", handleResize);
  if (typeof ResizeObserver !== "undefined" && contentRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateEdgePaths();
    });
    resizeObserver.observe(contentRef.value);
  }
  scheduleUpdate();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <div class="flow-chart-board">
    <div ref="contentRef" class="flow-chart-board__content">
      <svg
        class="flow-chart-board__svg"
        :width="svgWidth"
        :height="svgHeight"
        :viewBox="`0 0 ${svgWidth || 1} ${svgHeight || 1}`"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="flow-chart-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#aab5bf" />
          </marker>
        </defs>

        <g v-for="edge in edgePaths" :key="edge.id">
          <path :d="edge.d" class="flow-chart-board__path" />
          <text
            v-if="edge.label"
            :x="edge.labelX"
            :y="edge.labelY"
            :class="['flow-chart-board__label', `flow-chart-board__label--${edge.tone}`]"
          >
            {{ edge.label }}
          </text>
        </g>
      </svg>

      <div class="flow-chart-board__canvas" :style="getBoardStyle()">
        <div
          v-for="node in visualization.nodes"
          :key="node.id"
          :ref="setNodeRef(node.id)"
          :style="getNodeStyle(node.column, node.row)"
          :class="[
            'flow-chart-node',
            `flow-chart-node--${node.shape}`,
            `flow-chart-node--${node.accent ?? 'neutral'}`
          ]"
        >
          <div class="flow-chart-node__content">
            <strong>{{ node.label }}</strong>
            <p v-if="node.description">{{ node.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow-chart-board {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 8px 28px;
}

.flow-chart-board__content {
  position: relative;
  width: max-content;
  min-width: 100%;
}

.flow-chart-board__svg {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.flow-chart-board__path {
  fill: none;
  stroke: #b8c0c8;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  marker-end: url(#flow-chart-arrow);
}

.flow-chart-board__label {
  fill: #727b83;
  font-size: 11px;
  font-weight: 800;
}

.flow-chart-board__label--positive {
  fill: #4e63ff;
}

.flow-chart-board__label--negative {
  fill: #fb4f4f;
}

.flow-chart-board__canvas {
  position: relative;
  z-index: 1;
  display: grid;
  column-gap: 72px;
  row-gap: 28px;
  width: max-content;
  min-width: 100%;
  padding: 10px 18px 34px;
  align-items: center;
}

.flow-chart-node {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 120px;
  justify-self: center;
}

.flow-chart-node__content {
  position: relative;
  z-index: 1;
  width: 220px;
  min-height: 84px;
  padding: 18px 18px;
  background: #ffffff;
  text-align: center;
  box-shadow: 0 10px 24px rgba(12, 58, 39, 0.05);
}

.flow-chart-node__content strong {
  display: block;
  font-size: 14px;
  line-height: 1.45;
  color: #2d3b34;
}

.flow-chart-node__content p {
  margin: 8px 0 0;
  color: #66756b;
  font-size: 12px;
  line-height: 1.5;
}

.flow-chart-node--document,
.flow-chart-node--decision {
  isolation: isolate;
}

.flow-chart-node--process .flow-chart-node__content {
  border: 1.5px solid #cfd6dc;
  border-radius: 6px;
}

.flow-chart-node--terminator .flow-chart-node__content {
  border: 1.5px solid #cfd6dc;
  border-radius: 999px;
}

.flow-chart-node--document::before,
.flow-chart-node--decision::before,
.flow-chart-node--decision::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  pointer-events: none;
}

.flow-chart-node--document::before {
  display: none;
}

.flow-chart-node--document .flow-chart-node__content {
  width: 210px;
  min-height: 78px;
  padding: 18px 20px;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.flow-chart-node--document .flow-chart-node__content::before,
.flow-chart-node--document .flow-chart-node__content::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: skewX(-12deg);
  transform-origin: center;
  pointer-events: none;
}

.flow-chart-node--document .flow-chart-node__content::before {
  inset: -2px;
  background: var(--flow-node-border, #cfd6dc);
  box-shadow: 0 10px 24px rgba(12, 58, 39, 0.05);
  z-index: -2;
}

.flow-chart-node--document .flow-chart-node__content::after {
  background: #ffffff;
  z-index: -1;
}

.flow-chart-node--subprocess .flow-chart-node__content {
  border: 1.5px solid #cfd6dc;
  border-radius: 6px;
  box-shadow:
    inset 9px 0 0 rgba(154, 171, 185, 0.18),
    inset -9px 0 0 rgba(154, 171, 185, 0.18),
    0 10px 24px rgba(12, 58, 39, 0.05);
}

.flow-chart-node--decision::before {
  width: 220px;
  height: 132px;
  background: var(--flow-node-border, #cfd6dc);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  box-shadow: 0 10px 24px rgba(12, 58, 39, 0.05);
}

.flow-chart-node--decision::after {
  width: 215px;
  height: 129px;
  background: #ffffff;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
}

.flow-chart-node--decision .flow-chart-node__content {
  width: 220px;
  min-height: 118px;
  padding: 24px 22px;
  background: transparent;
  box-shadow: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.flow-chart-node--decision .flow-chart-node__content strong {
  line-height: 1.35;
}

.flow-chart-node--primary .flow-chart-node__content {
  border-color: rgba(0, 105, 77, 0.34);
}

.flow-chart-node--secondary .flow-chart-node__content {
  border-color: rgba(120, 192, 70, 0.55);
}

.flow-chart-node--neutral .flow-chart-node__content {
  border-color: #cfd6dc;
}

.flow-chart-node--primary {
  --flow-node-border: rgba(0, 105, 77, 0.34);
}

.flow-chart-node--secondary {
  --flow-node-border: rgba(120, 192, 70, 0.55);
}

.flow-chart-node--neutral {
  --flow-node-border: #cfd6dc;
}

@media (max-width: 1200px) {
  .flow-chart-board__canvas {
    min-width: max-content;
  }
}
</style>

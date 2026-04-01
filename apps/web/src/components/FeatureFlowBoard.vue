<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref } from "vue";
import { MarkerType, Position, VueFlow, type Edge, type Node } from "@vue-flow/core";
import type { FeatureFlowVisualization } from "@mottor-plan/shared";
import FeatureFlowNode from "./FeatureFlowNode.vue";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

const props = defineProps<{
  visualization: FeatureFlowVisualization;
}>();

const nodeTypes = {
  featureNode: markRaw(FeatureFlowNode)
} as Record<string, any>;

const graphState = computed(() => buildGraphState(props.visualization));

const flowNodes = computed(() => graphState.value.nodes);
const flowEdges = computed(() => graphState.value.edges);
const boardRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
let dragStartX = 0;
let dragStartScrollLeft = 0;

const boardStyle = computed(() => ({
  width: `${graphState.value.width}px`,
  height: `${graphState.value.height}px`
}));

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0 || !boardRef.value) {
    return;
  }

  isDragging.value = true;
  dragStartX = event.clientX;
  dragStartScrollLeft = boardRef.value.scrollLeft;
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
}

function handlePointerMove(event: PointerEvent) {
  if (!isDragging.value || !boardRef.value) {
    return;
  }

  const deltaX = event.clientX - dragStartX;
  boardRef.value.scrollLeft = dragStartScrollLeft - deltaX;
}

function handlePointerUp() {
  isDragging.value = false;
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", handlePointerUp);
}

onBeforeUnmount(() => {
  handlePointerUp();
});

function buildGraphState(visualization: FeatureFlowVisualization) {
  const nodeWidth = 220;
  const nodeHeight = 116;
  const columnGap = 320;
  const rowGap = 168;
  const topPadding = 36;
  const leftPadding = 40;

  const grouped = new Map<number, FeatureFlowVisualization["nodes"]>();
  for (const node of visualization.nodes) {
    const bucket = grouped.get(node.column) ?? [];
    bucket.push(node);
    grouped.set(node.column, bucket);
  }

  const maxRows = Math.max(...Array.from(grouped.values(), (nodes) => nodes.length), 1);
  const positionLookup = new Map<string, { x: number; y: number }>();

  for (const [column, nodes] of grouped.entries()) {
    const columnOffset = ((maxRows - nodes.length) * rowGap) / 2;

    nodes.forEach((node, index) => {
      positionLookup.set(node.id, {
        x: column * columnGap + leftPadding,
        y: topPadding + columnOffset + index * rowGap
      });
    });
  }

  const nodes: Node[] = visualization.nodes.map((node) => {
    const position = positionLookup.get(node.id) ?? { x: leftPadding, y: topPadding };

    return {
      id: node.id,
      type: "featureNode",
      position,
      data: {
        label: node.label,
        description: node.description,
        accent: node.accent
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
      selectable: false,
      connectable: false
    };
  });

  const edges: Edge[] = visualization.edges.map((edge) => {
    const fromPosition = positionLookup.get(edge.from);
    const toPosition = positionLookup.get(edge.to);
    const deltaY = Math.abs((fromPosition?.y ?? 0) - (toPosition?.y ?? 0));

    return {
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      sourceHandle: "right",
      targetHandle: "left",
      type: "smoothstep",
      label: deltaY > 56 ? edge.label : undefined,
      labelStyle: {
        fill: "#5f6d64",
        fontSize: "11px",
        fontWeight: 700
      },
      labelShowBg: true,
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 999,
      labelBgStyle: {
        fill: "rgba(255, 255, 255, 0.96)"
      },
      style: {
        stroke: "rgba(0, 105, 77, 0.28)",
        strokeWidth: 2
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "rgba(0, 105, 77, 0.28)",
        width: 18,
        height: 18
      },
      animated: false
    };
  });

  const width = (Math.max(...visualization.nodes.map((node) => node.column), 0) + 1) * columnGap + 120;
  const height = Math.max(topPadding * 2 + maxRows * rowGap - (rowGap - nodeHeight), 220);

  return { nodes, edges, width, height };
}
</script>

<template>
  <div
    ref="boardRef"
    :class="['feature-flow-board', { 'feature-flow-board--dragging': isDragging }]"
    @pointerdown.capture="handlePointerDown"
  >
    <div class="feature-flow-board__canvas" :style="boardStyle">
      <VueFlow
        :nodes="flowNodes"
        :edges="flowEdges"
        :node-types="nodeTypes"
        :nodes-draggable="false"
        :elements-selectable="false"
        :nodes-connectable="false"
        :zoom-on-scroll="false"
        :pan-on-scroll="false"
        :pan-on-drag="false"
        :prevent-scrolling="false"
        :fit-view-on-init="false"
        class="feature-flow-board__flow"
      />
    </div>
  </div>
</template>

<style scoped>
.feature-flow-board {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 0 8px;
  cursor: grab;
}

.feature-flow-board__canvas {
  min-width: 100%;
  border-radius: 18px;
  background:
    linear-gradient(rgba(0, 105, 77, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 105, 77, 0.05) 1px, transparent 1px);
  background-size: 24px 24px;
  background-color: #fcfdfc;
}

.feature-flow-board__flow {
  width: 100%;
  height: 100%;
}

.feature-flow-board--dragging {
  cursor: grabbing;
  user-select: none;
}

:deep(.feature-flow-board__flow .vue-flow__pane) {
  cursor: inherit;
}

:deep(.feature-flow-board__flow .vue-flow__viewport) {
  transform: translate(0px, 0px) scale(1) !important;
}

:deep(.feature-flow-board__flow .vue-flow__node) {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}
</style>

<script setup lang="ts">
import { computed, markRaw } from "vue";
import { MarkerType, VueFlow, type Edge, type Node } from "@vue-flow/core";
import type { FlowChartVisualization } from "@mottor-plan/shared";
import FlowChartNode from "./FlowChartNode.vue";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

const props = defineProps<{
  visualization: FlowChartVisualization;
}>();

const nodeTypes = {
  flowChartNode: markRaw(FlowChartNode)
} as Record<string, any>;

const graphState = computed(() => buildGraphState(props.visualization));
const flowNodes = computed(() => graphState.value.nodes);
const flowEdges = computed(() => graphState.value.edges);
const boardStyle = computed(() => ({
  width: `${graphState.value.width}px`,
  height: `${graphState.value.height}px`
}));

function buildGraphState(visualization: FlowChartVisualization) {
  const columnGap = 300;
  const rowGap = 180;
  const nodeWidth = 220;
  const nodeHeight = 132;

  const lookup = new Map(visualization.nodes.map((node) => [node.id, node]));

  const nodes: Node[] = visualization.nodes.map((node) => ({
    id: node.id,
    type: "flowChartNode",
    position: {
      x: node.column * columnGap + 40,
      y: node.row * rowGap + 30
    },
    data: {
      label: node.label,
      description: node.description,
      shape: node.shape,
      accent: node.accent
    },
    draggable: false,
    selectable: false,
    connectable: false
  }));

  const edges: Edge[] = visualization.edges.map((edge) => {
    const fromNode = lookup.get(edge.from);
    const toNode = lookup.get(edge.to);
    const tone = getEdgeTone(edge.label);
    const sourceHandle = resolveSourceHandle(fromNode, toNode);
    const targetHandle = resolveTargetHandle(fromNode, toNode);
    const stroke = tone === "positive" ? "#4e63ff" : tone === "negative" ? "#fb4f4f" : "#aab5bf";

    return {
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      sourceHandle,
      targetHandle,
      type: "smoothstep",
      label: edge.label,
      labelStyle: {
        fill: stroke,
        fontSize: "11px",
        fontWeight: 800
      },
      labelShowBg: true,
      labelBgPadding: [6, 4],
      labelBgBorderRadius: 999,
      labelBgStyle: {
        fill: "rgba(255, 255, 255, 0.96)"
      },
      style: {
        stroke,
        strokeWidth: 2.2
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: stroke,
        width: 18,
        height: 18
      }
    };
  });

  const maxColumn = Math.max(...visualization.nodes.map((node) => node.column), 0);
  const maxRow = Math.max(...visualization.nodes.map((node) => node.row), 0);

  return {
    nodes,
    edges,
    width: (maxColumn + 1) * columnGap + nodeWidth,
    height: (maxRow + 1) * rowGap + nodeHeight
  };
}

function getEdgeTone(label?: string) {
  const normalized = label?.trim().toLowerCase() ?? "";
  if (normalized.includes("yes") || normalized.includes("승인") || normalized.includes("완료") || normalized.includes("적합")) {
    return "positive";
  }

  if (normalized.includes("no") || normalized.includes("실패") || normalized.includes("불가") || normalized.includes("보완")) {
    return "negative";
  }

  return "neutral";
}

function resolveSourceHandle(
  fromNode: FlowChartVisualization["nodes"][number] | undefined,
  toNode: FlowChartVisualization["nodes"][number] | undefined
) {
  if (!fromNode || !toNode) {
    return "bottom-source";
  }

  if (fromNode.row === toNode.row) {
    return toNode.column >= fromNode.column ? "right-source" : "left-source";
  }

  return toNode.row > fromNode.row ? "bottom-source" : "top-source";
}

function resolveTargetHandle(
  fromNode: FlowChartVisualization["nodes"][number] | undefined,
  toNode: FlowChartVisualization["nodes"][number] | undefined
) {
  if (!fromNode || !toNode) {
    return "top-target";
  }

  if (fromNode.row === toNode.row) {
    return toNode.column >= fromNode.column ? "left-target" : "right-target";
  }

  return toNode.row > fromNode.row ? "top-target" : "bottom-target";
}
</script>

<template>
  <div class="flow-chart-board">
    <div class="flow-chart-board__canvas" :style="boardStyle">
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
        class="flow-chart-board__flow"
      />
    </div>
  </div>
</template>

<style scoped>
.flow-chart-board {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 12px 8px 28px;
}

.flow-chart-board__canvas {
  min-width: 100%;
  border-radius: 18px;
  background:
    linear-gradient(rgba(0, 105, 77, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 105, 77, 0.05) 1px, transparent 1px);
  background-size: 24px 24px;
  background-color: #fcfdfc;
}

.flow-chart-board__flow {
  width: 100%;
  height: 100%;
}

:deep(.flow-chart-board__flow .vue-flow__pane) {
  cursor: default;
}

:deep(.flow-chart-board__flow .vue-flow__viewport) {
  transform: translate(0px, 0px) scale(1) !important;
}

:deep(.flow-chart-board__flow .vue-flow__node) {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

:global(.document-board--image-export) .flow-chart-board__canvas .vue-flow__edge-path {
  marker-end: none;
}
</style>

<script setup lang="ts">
import dagre from "dagre";
import { computed, markRaw } from "vue";
import { MarkerType, VueFlow, type Edge, type Node } from "@vue-flow/core";
import type { TreeMapNode, TreeMapVisualization } from "@mottor-plan/shared";
import UserFlowNode from "./UserFlowNode.vue";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";

const props = defineProps<{
  visualization: TreeMapVisualization;
}>();

const nodeTypes = {
  userFlowNode: markRaw(UserFlowNode)
} as Record<string, any>;

const graphState = computed(() => buildGraphState(props.visualization));
const flowNodes = computed(() => graphState.value.nodes);
const flowEdges = computed(() => graphState.value.edges);
const boardStyle = computed(() => ({
  width: `${graphState.value.width}px`,
  height: `${graphState.value.height}px`
}));

function buildGraphState(visualization: TreeMapVisualization) {
  const graph = new dagre.graphlib.Graph();
  const nodeWidth = 240;
  const nodeHeight = 92;

  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    ranksep: 80,
    nodesep: 32,
    marginx: 24,
    marginy: 24
  });

  const flatNodes: TreeMapNode[] = [];
  const flatEdges: Array<{ source: string; target: string }> = [];

  walkTree(visualization.root, (node, parent) => {
    flatNodes.push(node);
    graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });

    if (parent) {
      flatEdges.push({ source: parent.id, target: node.id });
      graph.setEdge(parent.id, node.id);
    }
  });

  dagre.layout(graph);

  const nodes: Node[] = flatNodes.map((node) => {
    const layoutNode = graph.node(node.id);

    return {
      id: node.id,
      type: "userFlowNode",
      position: {
        x: Math.max((layoutNode?.x ?? nodeWidth / 2) - nodeWidth / 2, 16),
        y: Math.max((layoutNode?.y ?? nodeHeight / 2) - nodeHeight / 2, 16)
      },
      data: {
        label: node.label,
        description: node.description,
        accent: node.accent
      },
      draggable: false,
      selectable: false,
      connectable: false
    };
  });

  const edges: Edge[] = flatEdges.map((edge) => ({
    id: `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: "right",
    targetHandle: "left",
    type: "smoothstep",
    style: {
      stroke: "rgba(92, 102, 95, 0.35)",
      strokeWidth: 1.8
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "rgba(92, 102, 95, 0.35)",
      width: 16,
      height: 16
    }
  }));

  const graphWidth = graph.graph().width ?? nodeWidth;
  const graphHeight = graph.graph().height ?? nodeHeight;

  return {
    nodes,
    edges,
    width: Math.max(graphWidth + 48, 720),
    height: Math.max(graphHeight + 48, 240)
  };
}

function walkTree(node: TreeMapNode, visit: (node: TreeMapNode, parent?: TreeMapNode) => void, parent?: TreeMapNode) {
  visit(node, parent);

  for (const child of node.children ?? []) {
    walkTree(child, visit, node);
  }
}
</script>

<template>
  <div class="user-flow-board">
    <div class="user-flow-board__canvas" :style="boardStyle">
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
        class="user-flow-board__flow"
      />
    </div>
  </div>
</template>

<style scoped>
.user-flow-board {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 16px 8px 20px;
}

.user-flow-board__canvas {
  min-width: 100%;
  border-radius: 18px;
  background:
    linear-gradient(rgba(0, 105, 77, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 105, 77, 0.05) 1px, transparent 1px);
  background-size: 24px 24px;
  background-color: #fcfdfc;
}

.user-flow-board__flow {
  width: 100%;
  height: 100%;
}

:deep(.user-flow-board__flow .vue-flow__pane) {
  cursor: default;
}

:deep(.user-flow-board__flow .vue-flow__viewport) {
  transform: translate(0px, 0px) scale(1) !important;
}

:deep(.user-flow-board__flow .vue-flow__node) {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}
</style>

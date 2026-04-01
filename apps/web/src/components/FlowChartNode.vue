<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import type { FlowChartNodeShape, VisualizationAccent } from "@mottor-plan/shared";

defineProps<{
  data: {
    label: string;
    description?: string;
    shape: FlowChartNodeShape;
    accent?: VisualizationAccent;
  };
}>();
</script>

<template>
  <div
    :class="[
      'flow-chart-node',
      `flow-chart-node--${data.shape}`,
      `flow-chart-node--${data.accent ?? 'neutral'}`
    ]"
  >
    <Handle id="top-source" type="source" :position="Position.Top" class="flow-chart-node__handle" />
    <Handle id="right-source" type="source" :position="Position.Right" class="flow-chart-node__handle" />
    <Handle id="bottom-source" type="source" :position="Position.Bottom" class="flow-chart-node__handle" />
    <Handle id="left-source" type="source" :position="Position.Left" class="flow-chart-node__handle" />
    <Handle id="top-target" type="target" :position="Position.Top" class="flow-chart-node__handle" />
    <Handle id="right-target" type="target" :position="Position.Right" class="flow-chart-node__handle" />
    <Handle id="bottom-target" type="target" :position="Position.Bottom" class="flow-chart-node__handle" />
    <Handle id="left-target" type="target" :position="Position.Left" class="flow-chart-node__handle" />
    <div class="flow-chart-node__content">
      <strong>{{ data.label }}</strong>
      <p v-if="data.description">{{ data.description }}</p>
    </div>
  </div>
</template>

<style scoped>
.flow-chart-node {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 120px;
  width: 220px;
  isolation: isolate;
}

.flow-chart-node__content {
  position: relative;
  z-index: 1;
  width: 220px;
  min-height: 84px;
  padding: 18px;
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

.flow-chart-node__handle {
  width: 10px;
  height: 10px;
  opacity: 0;
  pointer-events: none;
}

.flow-chart-node--process .flow-chart-node__content {
  border: 1.5px solid #cfd6dc;
  border-radius: 6px;
}

.flow-chart-node--terminator .flow-chart-node__content {
  border: 1.5px solid #cfd6dc;
  border-radius: 999px;
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
  /* box-shadow:
    inset 9px 0 0 rgba(154, 171, 185, 0.18),
    inset -9px 0 0 rgba(154, 171, 185, 0.18),
    0 10px 24px rgba(12, 58, 39, 0.05); */
}

.flow-chart-node--decision::before,
.flow-chart-node--decision::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  pointer-events: none;
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
</style>

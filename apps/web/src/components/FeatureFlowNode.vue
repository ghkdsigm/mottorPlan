<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import type { VisualizationAccent } from "@mottor-plan/shared";

defineProps<{
  data: {
    label: string;
    description?: string;
    accent?: VisualizationAccent;
  };
}>();
</script>

<template>
  <div :class="['feature-flow-card', `feature-flow-card--${data.accent ?? 'neutral'}`]">
    <Handle id="left" type="target" :position="Position.Left" class="feature-flow-card__handle" />
    <Handle id="right" type="source" :position="Position.Right" class="feature-flow-card__handle" />
    <strong>{{ data.label }}</strong>
    <p v-if="data.description">{{ data.description }}</p>
  </div>
</template>

<style scoped>
.feature-flow-card {
  width: 220px;
  min-height: 84px;
  padding: 16px 18px;
  border: 1px solid #cfd6dc;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 20px rgba(12, 58, 39, 0.05);
}

.feature-flow-card strong {
  display: block;
  margin-bottom: 8px;
  font-size: 15px;
  line-height: 1.45;
  color: #2d3b34;
}

.feature-flow-card p {
  margin: 0;
  color: #66756b;
  font-size: 13px;
  line-height: 1.5;
}

.feature-flow-card--primary {
  border-color: rgba(0, 105, 77, 0.35);
}

.feature-flow-card--secondary {
  border-color: rgba(120, 192, 70, 0.5);
}

.feature-flow-card--neutral {
  border-color: rgba(194, 214, 190, 0.95);
}

.feature-flow-card__handle {
  width: 10px;
  height: 10px;
  opacity: 0;
  pointer-events: none;
}
</style>

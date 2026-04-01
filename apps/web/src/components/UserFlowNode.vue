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
  <div :class="['user-flow-node', `user-flow-node--${data.accent ?? 'neutral'}`]">
    <Handle id="left" type="target" :position="Position.Left" class="user-flow-node__handle" />
    <Handle id="right" type="source" :position="Position.Right" class="user-flow-node__handle" />
    <strong>{{ data.label }}</strong>
    <p v-if="data.description">{{ data.description }}</p>
  </div>
</template>

<style scoped>
.user-flow-node {
  min-width: 200px;
  max-width: 260px;
  padding: 12px 14px;
  border: 1px solid rgba(194, 214, 190, 0.9);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 18px rgba(12, 58, 39, 0.05);
}

.user-flow-node strong {
  display: block;
  font-size: 14px;
  line-height: 1.45;
}

.user-flow-node p {
  margin: 6px 0 0;
  color: #66756b;
  font-size: 12px;
  line-height: 1.45;
}

.user-flow-node--primary {
  border-color: rgba(111, 77, 241, 0.25);
  color: #5b34d2;
  background: rgba(111, 77, 241, 0.06);
}

.user-flow-node--secondary {
  border-color: rgba(0, 105, 77, 0.25);
  color: #00694d;
  background: rgba(0, 105, 77, 0.06);
}

.user-flow-node--neutral {
  color: #33423a;
}

.user-flow-node__handle {
  width: 10px;
  height: 10px;
  opacity: 0;
  pointer-events: none;
}
</style>

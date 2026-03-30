<script setup lang="ts">
import type { TreeMapVisualization } from "@mottor-plan/shared";
import TreeMapBranch from "./TreeMapBranch.vue";

defineProps<{
  visualization: TreeMapVisualization;
}>();
</script>

<template>
  <div class="tree-map">
    <TreeMapBranch :node="visualization.root" />
  </div>
</template>

<style scoped>
.tree-map {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 16px 8px 20px;
}
</style>

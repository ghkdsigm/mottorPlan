<script setup lang="ts">
import type { TreeMapNode } from "@mottor-plan/shared";

defineOptions({
  name: "TreeMapBranch"
});

const props = defineProps<{
  node: TreeMapNode;
}>();

function accentClass(accent?: TreeMapNode["accent"]) {
  return accent ? `tree-node--${accent}` : "tree-node--neutral";
}
</script>

<template>
  <div class="tree-branch">
    <div :class="['tree-branch__self', { 'tree-branch__self--has-children': props.node.children?.length }]">
      <div :class="['tree-node', accentClass(props.node.accent)]">
        <strong>{{ props.node.label }}</strong>
        <p v-if="props.node.description">{{ props.node.description }}</p>
      </div>
    </div>

    <div v-if="props.node.children?.length" class="tree-branch__children">
      <TreeMapBranch
        v-for="child in props.node.children"
        :key="child.id"
        :node="child"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-branch {
  display: flex;
  align-items: stretch;
  gap: 40px;
  min-width: max-content;
}

.tree-branch__self {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 220px;
}

.tree-branch__self--has-children::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -40px;
  width: 40px;
  border-top: 1px solid rgba(92, 102, 95, 0.35);
}

.tree-node {
  min-width: 200px;
  max-width: 260px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 18px rgba(12, 58, 39, 0.05);
}

.tree-node strong {
  display: block;
  font-size: 14px;
}

.tree-node p {
  margin: 6px 0 0;
  color: #66756b;
  font-size: 12px;
  line-height: 1.45;
}

.tree-node--primary {
  border: 1px solid rgba(111, 77, 241, 0.25);
  color: #5b34d2;
  background: rgba(111, 77, 241, 0.06);
}

.tree-node--secondary {
  border: 1px solid rgba(0, 105, 77, 0.25);
  color: #00694d;
  background: rgba(0, 105, 77, 0.06);
}

.tree-node--neutral {
  border: 1px solid rgba(194, 214, 190, 0.9);
  color: #33423a;
}

.tree-branch__children {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
  padding-left: 24px;
}

.tree-branch__children::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-left: 1px solid rgba(92, 102, 95, 0.35);
}

.tree-branch__children > .tree-branch {
  position: relative;
}

.tree-branch__children > .tree-branch::before {
  content: "";
  position: absolute;
  top: 50%;
  left: -24px;
  width: 24px;
  border-top: 1px solid rgba(92, 102, 95, 0.35);
}
</style>

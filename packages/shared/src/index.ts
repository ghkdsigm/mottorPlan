export type ArtifactKind = "prd" | "feature-spec" | "policy-spec" | "user-flow" | "flow-chart";

export interface ArtifactSection {
  title: string;
  summary: string;
  bullets: string[];
}

export type VisualizationAccent = "primary" | "secondary" | "neutral";

export interface FeatureFlowNode {
  id: string;
  label: string;
  description?: string;
  column: number;
  accent?: VisualizationAccent;
}

export interface FeatureFlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FeatureFlowVisualization {
  type: "feature-flow";
  rootNodeId: string;
  nodes: FeatureFlowNode[];
  edges: FeatureFlowEdge[];
}

export interface TreeMapNode {
  id: string;
  label: string;
  description?: string;
  accent?: VisualizationAccent;
  children?: TreeMapNode[];
}

export interface TreeMapVisualization {
  type: "tree-map";
  title: string;
  root: TreeMapNode;
}

export interface PolicyTableColumn {
  key: string;
  label: string;
}

export interface PolicyTableRow {
  id: string;
  values: Record<string, string>;
}

export interface PolicyTableVisualization {
  type: "policy-table";
  title: string;
  columns: PolicyTableColumn[];
  rows: PolicyTableRow[];
}

export type FlowChartNodeShape = "terminator" | "process" | "decision" | "document" | "subprocess";

export interface FlowChartNode {
  id: string;
  label: string;
  description?: string;
  column: number;
  row: number;
  shape: FlowChartNodeShape;
  accent?: VisualizationAccent;
}

export interface FlowChartEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowChartVisualization {
  type: "flow-chart";
  title: string;
  nodes: FlowChartNode[];
  edges: FlowChartEdge[];
}

export type ArtifactVisualization =
  | FeatureFlowVisualization
  | TreeMapVisualization
  | PolicyTableVisualization
  | FlowChartVisualization;

export interface ArtifactDocument {
  kind: ArtifactKind;
  title: string;
  version: string;
  generatedAt: string;
  sections: ArtifactSection[];
  visualization?: ArtifactVisualization;
}

export interface WorkspaceArtifactSet {
  prd: ArtifactDocument;
  featureSpec: ArtifactDocument;
  policySpec: ArtifactDocument;
  userFlow: ArtifactDocument;
  flowChart: ArtifactDocument;
}

export interface GenerationRequest {
  prompt: string;
  workspaceName: string;
}

export interface GenerationResponse {
  sessionId: string;
  artifacts: WorkspaceArtifactSet;
  suggestedActions: string[];
}

export interface HistoryItem {
  id: string;
  title: string;
  createdAt: string;
  summary: string;
}

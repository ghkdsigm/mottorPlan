export type ArtifactKind = "prd" | "feature-spec" | "user-flow";

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

export type ArtifactVisualization = FeatureFlowVisualization | TreeMapVisualization;

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
  userFlow: ArtifactDocument;
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

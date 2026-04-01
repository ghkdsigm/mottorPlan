export type ArtifactKind =
  | "prd"
  | "feature-spec"
  | "policy-spec"
  | "user-flow"
  | "flow-chart"
  | "screen-spec";
export type ArtifactKey = "prd" | "featureSpec" | "policySpec" | "userFlow" | "flowChart" | "screenSpec";
export const DOMAIN_PRESET_OPTIONS = [
  "general",
  "commerce",
  "erp",
  "groupware",
  "mes",
  "finance",
  "healthcare",
  "logistics",
  "edtech",
  "custom"
] as const;
export type DomainPreset = (typeof DOMAIN_PRESET_OPTIONS)[number];

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

export interface ScreenSpecInput {
  screenId: string;
  screenName: string;
  route?: string;
  systemName?: string;
  author?: string;
  notes?: string;
  imageName?: string;
  imageDataUrl: string;
}

export interface ScreenSpecMarker {
  id: string;
  number: number;
  x: number;
  y: number;
  title: string;
  description?: string;
}

export interface ScreenSpecDescriptionSection {
  id: string;
  title: string;
  bullets: string[];
}

export interface ScreenSpecFunctionalRequirement {
  id: string;
  no: number;
  title: string;
  description: string;
}

export interface ScreenSpecPolicyReference {
  id: string;
  policyName: string;
  summary: string;
}

export interface ScreenSpecLink {
  id: string;
  label: string;
  targetScreenId?: string;
  description?: string;
}

export interface ScreenSpecChangeLogEntry {
  id: string;
  date: string;
  description: string;
}

export interface ScreenSpecPage {
  id: string;
  screenId: string;
  screenName: string;
  route?: string;
  systemName?: string;
  author?: string;
  createdDate?: string;
  imageDataUrl: string;
  imageName?: string;
  notes?: string;
  markers: ScreenSpecMarker[];
  descriptionSections: ScreenSpecDescriptionSection[];
  functionalRequirements: ScreenSpecFunctionalRequirement[];
  policyReferences: ScreenSpecPolicyReference[];
  relatedScreens: ScreenSpecLink[];
  changeLog: ScreenSpecChangeLogEntry[];
}

export interface ScreenSpecVisualization {
  type: "screen-spec";
  title: string;
  screens: ScreenSpecPage[];
}

export type ArtifactVisualization =
  | FeatureFlowVisualization
  | TreeMapVisualization
  | PolicyTableVisualization
  | FlowChartVisualization
  | ScreenSpecVisualization;

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
  screenSpec: ArtifactDocument;
}

export interface CreateProjectRequest {
  name: string;
  domainType?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  domainType?: string;
  createdAt: string;
  updatedAt: string;
  contextSummary?: string;
  latestSessionId?: string;
  lastPrompt?: string;
}

export interface ArtifactVersionSummary {
  id: string;
  kind: ArtifactKind;
  title: string;
  version: string;
  generatedAt: string;
  sessionId: string;
  parentDocumentId?: string | null;
}

export interface GenerationLogItem {
  sessionId: string;
  projectId: string;
  projectName: string;
  prompt: string;
  createdAt: string;
  targetArtifact?: ArtifactKey;
  summary: string;
}

export interface ProjectDetail {
  project: ProjectSummary;
  artifacts: WorkspaceArtifactSet;
  suggestedActions: string[];
  contextSummary: string;
  logs: GenerationLogItem[];
  versions: Record<ArtifactKey, ArtifactVersionSummary[]>;
}

export interface GenerationRequest {
  prompt: string;
  projectId?: string;
  workspaceName?: string;
  targetArtifact?: ArtifactKey;
  domainType?: string;
  screenInputs?: ScreenSpecInput[];
}

export interface GenerationResponse {
  project: ProjectSummary;
  sessionId: string;
  artifacts: WorkspaceArtifactSet;
  suggestedActions: string[];
  contextSummary: string;
  logs: GenerationLogItem[];
  versions: Record<ArtifactKey, ArtifactVersionSummary[]>;
}

export interface HistoryItem extends GenerationLogItem {}

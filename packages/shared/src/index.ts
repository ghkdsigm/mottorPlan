export type ArtifactKind = "prd" | "feature-spec" | "user-flow";

export interface ArtifactSection {
  title: string;
  summary: string;
  bullets: string[];
}

export interface ArtifactDocument {
  kind: ArtifactKind;
  title: string;
  version: string;
  generatedAt: string;
  sections: ArtifactSection[];
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

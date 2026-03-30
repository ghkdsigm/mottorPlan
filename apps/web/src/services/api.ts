import type { GenerationRequest, GenerationResponse, HistoryItem } from "@mottor-plan/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "API request failed");
  }

  return response.json() as Promise<T>;
}

export const api = {
  generate(payload: GenerationRequest) {
    return request<GenerationResponse>("/generation", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  getHistory() {
    return request<HistoryItem[]>("/history");
  }
};

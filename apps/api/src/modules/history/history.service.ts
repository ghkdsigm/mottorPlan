import { Injectable } from "@nestjs/common";
import type { HistoryItem } from "@mottor-plan/shared";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class HistoryService {
  constructor(private readonly projectsService: ProjectsService) {}

  async list(): Promise<HistoryItem[]> {
    return this.projectsService.listRecentLogs();
  }
}

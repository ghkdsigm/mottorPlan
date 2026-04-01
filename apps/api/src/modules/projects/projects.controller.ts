import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateProjectDto } from "./dto";
import { ProjectsService } from "./projects.service";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list() {
    return this.projectsService.listProjects();
  }

  @Post()
  create(@Body() body: CreateProjectDto) {
    return this.projectsService.createProject(body);
  }

  @Get(":projectId")
  detail(@Param("projectId") projectId: string) {
    return this.projectsService.getProjectDetail(projectId);
  }
}

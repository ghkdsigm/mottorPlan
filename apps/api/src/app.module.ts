import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { GenerationController } from "./modules/generation/generation.controller";
import { GenerationService } from "./modules/generation/generation.service";
import { HistoryController } from "./modules/history/history.controller";
import { HistoryService } from "./modules/history/history.service";
import { LlmService } from "./modules/llm/llm.service";
import { PrismaService } from "./modules/persistence/prisma.service";
import { ProjectsController } from "./modules/projects/projects.controller";
import { ProjectsService } from "./modules/projects/projects.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"]
    })
  ],
  controllers: [GenerationController, HistoryController, ProjectsController],
  providers: [PrismaService, ProjectsService, HistoryService, LlmService, GenerationService]
})
export class AppModule {}

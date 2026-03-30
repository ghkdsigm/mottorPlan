import { Body, Controller, Post } from "@nestjs/common";
import { GenerateArtifactsDto } from "./dto";
import { GenerationService } from "./generation.service";

@Controller("generation")
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post()
  generate(@Body() body: GenerateArtifactsDto) {
    return this.generationService.generate(body);
  }
}

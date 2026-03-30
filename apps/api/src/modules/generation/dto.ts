import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class GenerateArtifactsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  workspaceName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;
}

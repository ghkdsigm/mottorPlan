import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import type { ArtifactKey } from "@mottor-plan/shared";

export class GenerateArtifactsDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(100)
  workspaceName?: string;

  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsIn(["prd", "featureSpec", "policySpec", "userFlow", "flowChart"] satisfies ArtifactKey[])
  targetArtifact?: ArtifactKey;
}

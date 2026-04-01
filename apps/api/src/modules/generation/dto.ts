import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import type { ArtifactKey } from "@mottor-plan/shared";

class ScreenInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  screenId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  screenName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  route?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  systemName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  author?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  imageName?: string;

  @IsString()
  @IsNotEmpty()
  imageDataUrl!: string;
}

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
  @IsIn(["prd", "featureSpec", "policySpec", "userFlow", "flowChart", "screenSpec"] satisfies ArtifactKey[])
  targetArtifact?: ArtifactKey;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(100)
  domainType?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ScreenInputDto)
  screenInputs?: ScreenInputDto[];
}

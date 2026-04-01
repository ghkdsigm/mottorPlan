import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  domainType!: string;
}

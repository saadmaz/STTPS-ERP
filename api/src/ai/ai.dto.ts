import { ApiProperty } from "@nestjs/swagger";
import { IsObject, IsString, Length } from "class-validator";

export class AskAiDto {
  @ApiProperty() @IsString() @Length(1, 1000) question!: string;
}

export class ActAgentDto {
  @ApiProperty() @IsString() @Length(1, 100) actionName!: string;
  @ApiProperty() @IsObject() input!: Record<string, unknown>;
}

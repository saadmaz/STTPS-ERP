import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class AskAiDto {
  @ApiProperty() @IsString() @Length(1, 1000) question!: string;
}

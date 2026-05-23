import { IsString, IsDateString, IsNumber, IsOptional, IsBoolean } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateBankTransactionDto {
  @ApiProperty() @IsString() bankAccountId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() debit: number;
  @ApiProperty() @IsNumber() credit: number;
  @ApiProperty() @IsNumber() balance: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isReconciled?: boolean;
}

import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsUUID, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PriceListItemDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiProperty() @Type(() => Number) @IsNumber() unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() minQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
}

export class CreatePriceListDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validTo?: string;
  @ApiProperty({ type: [PriceListItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceListItemDto) items: PriceListItemDto[];
}

export class QuoteLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() qty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() taxCode?: string;
  @ApiProperty() @IsNumber() lineNumber: number;
}

export class CreateQuoteDto {
  @ApiProperty() @IsUUID() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() opportunityId?: string;
  @ApiProperty() @IsString() number: string;
  @ApiProperty() @IsString() quoteDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validUntil?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [QuoteLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuoteLineDto) lines: QuoteLineDto[];
}

export class SOLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() qty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() taxCode?: string;
  @ApiProperty() @IsNumber() lineNumber: number;
}

export class CreateSalesOrderDto {
  @ApiProperty() @IsUUID() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() quoteId?: string;
  @ApiProperty() @IsString() number: string;
  @ApiProperty() @IsString() orderDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requestedDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [SOLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => SOLineDto) lines: SOLineDto[];
}

export class DeliveryLineDto {
  @ApiProperty() @IsUUID() itemId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() soLineId?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() qty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() uom?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationId?: string;
  @ApiProperty() @IsNumber() lineNumber: number;
}

export class CreateDeliveryDto {
  @ApiProperty() @IsUUID() soId: string;
  @ApiProperty() @IsUUID() warehouseId: string;
  @ApiProperty() @IsString() number: string;
  @ApiProperty() @IsString() deliveryDate: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [DeliveryLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => DeliveryLineDto) lines: DeliveryLineDto[];
}

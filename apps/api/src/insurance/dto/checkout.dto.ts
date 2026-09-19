import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length } from 'class-validator';

export class CheckoutDto {
  @IsUUID('4', { message: 'quoteId must be a valid UUID' })
  quoteId!: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(3, 200)
  paymentToken!: string;
}

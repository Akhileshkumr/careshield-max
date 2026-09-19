import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { PREMIUM_RULES } from '@careshield/contracts';

export class CreateQuoteDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 100, { message: 'applicantName must be between 2 and 100 characters' })
  applicantName!: string;

  @IsInt({ message: 'age must be an integer' })
  @Min(PREMIUM_RULES.MIN_AGE, { message: `age must be at least ${PREMIUM_RULES.MIN_AGE}` })
  @Max(PREMIUM_RULES.MAX_AGE, { message: `age must be at most ${PREMIUM_RULES.MAX_AGE}` })
  age!: number;

  @IsBoolean({ message: 'hasPreExistingConditions must be a boolean' })
  hasPreExistingConditions!: boolean;
}

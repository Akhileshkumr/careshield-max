import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class MedicalDisclosuresDto {
  @IsInt()
  @Min(50)
  @Max(272)
  heightCm!: number;

  @IsInt()
  @Min(20)
  @Max(500)
  weightKg!: number;

  @IsBoolean()
  isSmoker!: boolean;

  @IsBoolean()
  consumesAlcohol!: boolean;

  @IsBoolean()
  hasDiabetes!: boolean;

  @IsBoolean()
  hasHypertension!: boolean;

  @IsBoolean()
  hasCardiacHistory!: boolean;

  @IsBoolean()
  hasCancerHistory!: boolean;

  @IsBoolean()
  hospitalisedLast12Months!: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  currentMedications: string[] = [];
}

export class MedicalDeclarationDto {
  @ValidateNested()
  @Type(() => MedicalDisclosuresDto)
  disclosures!: MedicalDisclosuresDto;

  @Equals(true, { message: 'You must confirm that your declaration is true and complete.' })
  declarationAccepted!: true;
}

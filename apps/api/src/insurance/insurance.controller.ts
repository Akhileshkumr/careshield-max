import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  IDEMPOTENCY_REPLAYED_HEADER,
  type MedicalDeclarationResponse,
  type PolicyResponse,
  type QuoteResponse,
} from '@careshield/contracts';
import type { Response } from 'express';

import { IdempotencyKey } from '../common/idempotency-key.decorator';
import { CheckoutService } from './checkout.service';
import { QuotesService } from './quotes.service';
import { CheckoutDto, CreateQuoteDto, MedicalDeclarationDto } from './dto';

@Controller('api/v1/insurance')
export class InsuranceController {
  constructor(
    private readonly quotes: QuotesService,
    private readonly checkoutService: CheckoutService,
  ) {}

  @Post('quote')
  @HttpCode(HttpStatus.CREATED)
  createQuote(@Body() dto: CreateQuoteDto): Promise<QuoteResponse> {
    return this.quotes.createQuote(dto);
  }

  @Get('quote/:id')
  getQuote(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<QuoteResponse> {
    return this.quotes.getQuote(id);
  }

  @Post('quote/:id/medical-declaration')
  @HttpCode(HttpStatus.OK)
  submitDeclaration(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: MedicalDeclarationDto,
  ): Promise<MedicalDeclarationResponse> {
    return this.quotes.submitDeclaration(id, dto);
  }

  @Post('checkout')
  async checkout(
    @Body() dto: CheckoutDto,
    @IdempotencyKey() idempotencyKey: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PolicyResponse> {
    const result = await this.checkoutService.checkout(dto, idempotencyKey);

    res.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    if (result.replayed) {
      res.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');
    }
    return result.policy;
  }

  @Get('policy/:id')
  getPolicy(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<PolicyResponse> {
    return this.checkoutService.getPolicy(id);
  }
}

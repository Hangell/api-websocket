import { Module } from '@nestjs/common';
import { TradierService } from './tradier.service';

@Module({
  providers: [TradierService],
  exports: [TradierService],
})
export class TradierModule {}

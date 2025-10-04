import { Module } from '@nestjs/common';
import { TickersGateway } from './tickers.gateway';
import { BinanceModule } from '@/shared/api-externals/binance/binance.module';

@Module({
  imports: [BinanceModule],
  providers: [TickersGateway],
  exports: [TickersGateway],
})
export class TickersModule { }

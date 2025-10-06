import { Module } from '@nestjs/common';
import { TickersGateway } from './tickers.gateway';
import { BinanceModule } from '@/shared/api-externals/binance/binance.module';
import { TradierModule } from '@/shared/api-externals/tradier/tradier.module';

@Module({
  imports: [BinanceModule, TradierModule],
  providers: [TickersGateway],
  exports: [TickersGateway],
})
export class TickersModule {}

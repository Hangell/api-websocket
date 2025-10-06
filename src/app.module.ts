import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { TickersModule } from './modules/tickers/tickers.module';
import { BinanceModule } from './shared/api-externals/binance/binance.module';
import { TradierModule } from './shared/api-externals/tradier/tradier.module';

@Module({
  imports: [HealthModule, TickersModule, BinanceModule, TradierModule],
  controllers: [],
  providers: [],
})
export class AppModule {}

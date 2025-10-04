import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { TickersModule } from './modules/tickers/tickers.module';
import { BinanceModule } from './shared/api-externals/binance/binance.module';

@Module({
  imports: [
    HealthModule,
    TickersModule,
    BinanceModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }

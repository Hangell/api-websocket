import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { BinanceModule } from './shared/api-externals/binance/binance.module';
import { CriptosModule } from './modules/criptos/criptos.module';

@Module({
  imports: [
    HealthModule,
    CriptosModule,
    BinanceModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }

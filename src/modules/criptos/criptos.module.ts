import { Module } from '@nestjs/common';
import { BinanceModule } from '@/shared/api-externals/binance/binance.module';
import { CriptosGateway } from './criptos.gateway';

@Module({
  imports: [BinanceModule],
  providers: [CriptosGateway],
  exports: [CriptosGateway],
})
export class CriptosModule { }

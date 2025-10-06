import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { BinanceService } from '@/shared/api-externals/binance/binance.service';
import { TradierService } from '@/shared/api-externals/tradier/tradier.service';

interface ClientSubs {
  [symbol: string]: Subscription;
}

type Source = 'binance' | 'tradier';

type SubscribePayload = {
  symbol: string;
  source?: Source;
};

type UnsubscribePayload = {
  symbol: string;
};

@WebSocketGateway({
  namespace: '/tickers',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
@Injectable()
export class TickersGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly log: Logger = new Logger(TickersGateway.name);

  private clientSubs: Map<string, ClientSubs> = new Map<string, ClientSubs>();

  constructor(
    private readonly binance: BinanceService,
    private readonly tradier: TradierService,
  ) {}

  handleConnection(client: Socket): void {
    this.clientSubs.set(client.id, {});
    client.emit('ready', { id: client.id });
    this.log.log(`client connected ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const subs = this.clientSubs.get(client.id);
    if (subs) {
      Object.values(subs).forEach((s: Subscription) => s?.unsubscribe());
      this.clientSubs.delete(client.id);
    }
    this.log.log(`client disconnected ${client.id}`);
  }

  private resolveSource(symbol: string, explicit?: Source): Source {
    if (explicit === 'binance' || explicit === 'tradier') return explicit;

    const s = symbol.toUpperCase();
    const isCrypto =
      /USDT$|BTC$|ETH$|BUSD$|USDC$|TUSD$|FDUSD$|TRY$|EUR$|BRL$/i.test(s) ||
      /^[A-Z0-9]{3,10}(USDT|BTC|ETH|BUSD|USDC|TUSD|FDUSD|TRY|EUR|BRL)$/.test(s);

    return isCrypto ? 'binance' : 'tradier';
  }

  @SubscribeMessage('subscribe')
  onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ): boolean | undefined {
    const symbol = String(payload?.symbol || '')
      .toUpperCase()
      .trim();
    const source = this.resolveSource(symbol, payload?.source);

    this.log.log(`SUBSCRIBE ${client.id} -> ${symbol} [${source}]`);

    if (!symbol) {
      return client.emit('error', { message: 'symbol � obrigat�rio' });
    }

    const subs = this.clientSubs.get(client.id)!;

    if (subs[symbol]) {
      return client.emit('subscribed', { symbol, already: true, source });
    }

    client.join(symbol);

    const observable =
      source === 'binance'
        ? this.binance.subscribe(symbol)
        : this.tradier.subscribe(symbol);

    const sub = observable.subscribe({
      next: (tick: any): void => {
        this.server.to(symbol).emit('tick', tick);
      },
      error: (err: any): boolean => {
        this.log.error(
          `stream error ${client.id} -> ${symbol} [${source}]: ${String(err?.message || err)}`,
        );
        return client.emit('error', {
          message: `stream error: ${String(err?.message || err)}`,
          symbol,
          source,
        });
      },
      complete: (): void => {
        this.log.warn(`stream complete ${client.id} -> ${symbol} [${source}]`);
        try {
          subs[symbol]?.unsubscribe();
        } catch {}
        delete subs[symbol];
        client.leave(symbol);
        client.emit('unsubscribed', { symbol, source, completed: true });
      },
    });

    subs[symbol] = sub;
    client.emit('subscribed', { symbol, source, already: false });

    return true;
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: UnsubscribePayload,
  ): boolean | undefined {
    const symbol = String(payload?.symbol || '')
      .toUpperCase()
      .trim();

    if (!symbol) {
      return client.emit('error', { message: 'symbol � obrigat�rio' });
    }

    const subs = this.clientSubs.get(client.id)!;
    const existing = subs[symbol];

    if (!existing) {
      return client.emit('unsubscribed', { symbol, already: true });
    }

    try {
      existing.unsubscribe();
    } catch {}
    delete subs[symbol];
    client.leave(symbol);

    this.log.log(`UNSUBSCRIBE ${client.id} -> ${symbol}`);
    client.emit('unsubscribed', { symbol, already: false });

    return true;
  }
}

//examples
//
//
//subs
//socket.emit('subscribe', { symbol: 'BTCUSDT' });   // usa Binance
//socket.emit('subscribe', { symbol: 'AAPL' });      // usa Tradier
//socket.emit('subscribe', { symbol: 'ETHUSDT', source: 'binance' });
//socket.emit('subscribe', { symbol: 'MSFT',    source: 'tradier' });
//
//
//unsb
//socket.emit('unsubscribe', { symbol: 'BTCUSDT' });

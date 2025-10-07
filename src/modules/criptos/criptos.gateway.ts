import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { BinanceService } from '@/shared/api-externals/binance/binance.service';

interface ClientSubs {
  [symbol: string]: Subscription;
}

@WebSocketGateway({
  namespace: '/criptos',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
@Injectable()
export class CriptosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly log = new Logger(CriptosGateway.name);

  private clientSubs = new Map<string, ClientSubs>();

  constructor(private readonly binance: BinanceService) { }

  handleConnection(client: Socket) {
    this.clientSubs.set(client.id, {});
    client.emit('ready', { id: client.id });
    this.log.log(`client connected ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const subs = this.clientSubs.get(client.id);
    if (subs) {
      Object.values(subs).forEach((s) => s?.unsubscribe());
      this.clientSubs.delete(client.id);
    }
    this.log.log(`client disconnected ${client.id}`);
  }

  // payload: { symbol: 'BTCUSDT' }
  @SubscribeMessage('subscribe')
  onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    const symbol = String(payload?.symbol || '').toUpperCase();
    this.log.log(`SUBSCRIBE ${client.id} -> ${symbol}`);
    if (!symbol) return client.emit('error', { message: 'symbol é obrigatório' });

    const subs = this.clientSubs.get(client.id)!;
    if (subs[symbol]) return client.emit('subscribed', { symbol, already: true });

    client.join(symbol);

    const sub = this.binance.subscribe(symbol).subscribe({
      next: (tick) => {
        this.server.to(symbol).emit('tick', tick);
      },
      error: (err) => client.emit('error', { symbol, message: err?.message || 'stream error' }),
      complete: () => client.emit('complete', { symbol }),
    });

    subs[symbol] = sub;
    client.emit('subscribed', { symbol });
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    const symbol = String(payload?.symbol || '').toUpperCase();
    if (!symbol) return client.emit('error', { message: 'symbol é obrigatório' });

    const subs = this.clientSubs.get(client.id)!;
    subs[symbol]?.unsubscribe();
    delete subs[symbol];

    client.leave(symbol);
    this.binance.unsubscribe(symbol);
    client.emit('unsubscribed', { symbol });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import WebSocket from 'ws';
import { Observable, timer } from 'rxjs';
import { map, retryWhen, scan, delayWhen, shareReplay } from 'rxjs/operators';

type SymbolKey = string;

@Injectable()
export class BinanceService {
  private readonly log = new Logger(BinanceService.name);
  private map = new Map<SymbolKey, Observable<any>>();
  private refs = new Map<SymbolKey, number>();

  subscribe(symbol: string): Observable<any> {
    const key = symbol.toLowerCase();
    const existing = this.map.get(key);
    if (existing) {
      this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
      return existing;
    }

    const stream$ = new Observable<any>((subscriber) => {
      const url = `wss://stream.binance.com:9443/ws/${key}@trade`;
      const ws = new WebSocket(url);

      ws.on('open', () => this.log.log(`Binance aberto: ${key}`));
      ws.on('message', (data) => {
        try {
          const j = JSON.parse(data.toString());
          subscriber.next({
            event: j.e,
            symbol: j.s,
            price: j.p,
            qty: j.q,
            ts: j.T ?? Date.now(),
          });
        } catch (e) {
          this.log.error(`json inválido: ${e}`);
        }
      });
      ws.on('error', (err) => subscriber.error(err));
      ws.on('close', () => subscriber.error(new Error('closed')));

      return () => {
        try {
          ws.close();
        } catch {}
      };
    }).pipe(
      retryWhen((errs) =>
        errs.pipe(
          scan((i) => i + 1, 0),
          delayWhen((i) => timer(Math.min(30000, 1000 * Math.pow(2, i)))),
        ),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.map.set(key, stream$);
    this.refs.set(key, 1);
    return stream$;
  }

  unsubscribe(symbol: string) {
    const key = symbol.toLowerCase();
    const count = (this.refs.get(key) ?? 0) - 1;
    if (count <= 0) {
      this.refs.delete(key);
      this.map.delete(key);
      this.log.log(`encerrado upstream ${key}`);
    } else {
      this.refs.set(key, count);
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import WebSocket from 'ws';
import { Observable, timer } from 'rxjs';
import { map, retryWhen, scan, delayWhen, shareReplay } from 'rxjs/operators';

type SymbolKey = string;

type TradierQuote = {
  type: 'quote';
  symbol: string;
  bid?: number;
  ask?: number;
  // podem existir outros campos; ignoramos
};

type StreamEvent =
  | {
      event: 'quote';
      symbol: string;
      bid?: number;
      ask?: number;
      ts: number;
    }
  | {
      event: 'other';
      raw: unknown;
      ts: number;
    };

@Injectable()
export class TradierService {
  private readonly log: Logger = new Logger(TradierService.name);
  private map: Map<SymbolKey, Observable<StreamEvent>> = new Map();
  private refs: Map<SymbolKey, number> = new Map();

  private readonly wssUrl: string =
    (process?.env?.TRADIER_STREAM_WSS as string) ||
    `wss://${(process?.env?.TRADIER_STREAM_URL as string) || 'ws.tradier.com/v1/markets/events'}`;

  private sessionId: string | null = null;

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
    this.log.log(`SessionId definido (len=${sessionId?.length ?? 0})`);
  }

  subscribe(symbol: string): Observable<StreamEvent> {
    const key = symbol.toUpperCase();
    const existing = this.map.get(key);
    if (existing) {
      this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
      return existing;
    }

    const stream$ = new Observable<StreamEvent>((subscriber) => {
      const ws = new WebSocket(this.wssUrl);

      const open = (): void => {
        this.log.log(`Tradier aberto: ${key}`);

        if (!this.sessionId) {
          subscriber.error(
            new Error(
              'Tradier: sessionId n�o definido. Use setSessionId() antes de subscribe().',
            ),
          );
          return;
        }

        // Tradier permite batch; aqui assinamos apenas o s�mbolo solicitado.
        const payload = {
          symbols: [key],
          sessionid: this.sessionId,
          linebreak: true,
        };

        try {
          ws.send(JSON.stringify(payload));
        } catch (e) {
          subscriber.error(
            new Error(`Tradier: falha ao enviar subscribe (${String(e)})`),
          );
        }
      };

      const message = (data: WebSocket.RawData): void => {
        try {
          // Tradier pode enviar m�ltiplas linhas com linebreak=true
          const text = typeof data === 'string' ? data : data.toString('utf-8');
          const lines = text.split(/\r?\n/).filter(Boolean);

          for (const line of lines) {
            let j: any;
            try {
              j = JSON.parse(line) as object;
            } catch (e) {
              this.log.error(`Tradier json inv�lido: ${e}`);
              continue;
            }

            if (j?.type === 'quote') {
              const q = j as TradierQuote;
              subscriber.next({
                event: 'quote',
                symbol: q.symbol,
                bid: typeof q.bid === 'number' ? q.bid : undefined,
                ask: typeof q.ask === 'number' ? q.ask : undefined,
                ts: Date.now(),
              });
            } else {
              // Outros tipos do Tradier (heartbeat, trade, etc.)
              subscriber.next({
                event: 'other',
                raw: j,
                ts: Date.now(),
              });
            }
          }
        } catch (e) {
          this.log.error(`Tradier handler erro: ${e}`);
        }
      };

      const error = (err: Error): void => subscriber.error(err);
      const close = (): void => subscriber.error(new Error('closed'));

      ws.on('open', open);
      ws.on('message', message);
      ws.on('error', error);
      ws.on('close', close);

      // teardown
      return (): void => {
        try {
          ws.close();
        } catch {}
      };
    }).pipe(
      retryWhen((errs: Observable<any>) =>
        errs.pipe(
          // i = n�mero de falhas
          scan((i: number) => i + 1, 0),
          delayWhen((i: any) => {
            const ms = Math.min(
              30000,
              1000 * Math.pow(2, Number.isFinite(i) ? i : 1),
            );
            this.log.warn(
              `Tradier reabrindo ${key} em ${ms}ms (tentativa ${i})`,
            );
            return timer(ms);
          }),
        ),
      ),
      // cacheia 1 valor, e fecha upstream quando refCount cai a zero
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.map.set(key, stream$);
    this.refs.set(key, 1);
    return stream$;
  }

  unsubscribe(symbol: string): void {
    const key = symbol.toUpperCase();
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

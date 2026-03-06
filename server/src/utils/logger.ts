import pino from 'pino';
import pinoHttp, { type Options } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty' } }),
});

const httpOptions: Options<IncomingMessage, ServerResponse> = {
  logger,
  genReqId: (req: IncomingMessage) => {
    const incoming = req.headers['x-request-id'];
    return (typeof incoming === 'string' && incoming) ? incoming : crypto.randomUUID();
  },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-app-token"]'],
  autoLogging: {
    ignore: (req: IncomingMessage) => {
      const url = req.url || '';
      return url === '/api/health'
        || url.startsWith('/assets/')
        || url.endsWith('.js')
        || url.endsWith('.css');
    },
  },
};

export const httpLogger = (pinoHttp as any)(httpOptions);

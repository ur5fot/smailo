import pino from 'pino';
import pinoHttp from 'pino-http';
import crypto from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty' } }),
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    const incoming = req.headers['x-request-id'];
    return (typeof incoming === 'string' && incoming) ? incoming : crypto.randomUUID();
  },
  customProps: (req) => ({
    userId: req.headers['x-user-id'] || null,
    appHash: (req as any).params?.hash || null,
  }),
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  autoLogging: {
    ignore: (req) => {
      const url = req.url || '';
      return url === '/api/health'
        || url.startsWith('/assets/')
        || url.endsWith('.js')
        || url.endsWith('.css');
    },
  },
});

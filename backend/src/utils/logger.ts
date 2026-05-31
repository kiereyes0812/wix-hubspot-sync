import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom format — NEVER logs tokens or PII
const safeFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  // Redact any accidental sensitive data
  const safeMessage = String(message)
    .replace(/access_token=[^&\s"']*/gi, 'access_token=[REDACTED]')
    .replace(/refresh_token=[^&\s"']*/gi, 'refresh_token=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]')
    .replace(/"(access|refresh)_token"\s*:\s*"[^"]+"/gi, '"$1_token":"[REDACTED]"');

  const safeMeta = Object.keys(meta).length
    ? ' ' + JSON.stringify(meta, (key, value) => {
        if (['access_token', 'refresh_token', 'password', 'secret', 'token'].includes(key)) {
          return '[REDACTED]';
        }
        return value;
      })
    : '';

  return `${timestamp} [${level}]: ${stack || safeMessage}${safeMeta}`;
});

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    process.env.NODE_ENV !== 'production' ? colorize() : winston.format.uncolorize(),
    safeFormat,
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
});

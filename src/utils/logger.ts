import winston, { format } from 'winston';
import SlackHook from 'winston-slack-webhook-transport';

import { PROD } from '../constants';

export const prettyJSON = (data: unknown) => JSON.stringify(data, null, 2);

const alignedWithColorsAndTime = format.combine(
  format.colorize(),
  format.timestamp(),
  format.align(),
  format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

const options = {
  console: {
    level: 'debug',
    handleExceptions: true,
    json: false,
    colorize: true,
  },
};

// Don't enable slack in testing
const transports: winston.transport[] = [];
if (process.env['NODE_ENV'] === PROD) {
  transports.push(
    new SlackHook({
      webhookUrl: process.env.SLACK_WEBHOOK_URL ?? '',
      level: 'error',
      formatter: (info) => {
        return {
          text: `${info.timestamp} ${info.level}: ${info.message}`,
        };
      },
    })
  );
}

const logger = winston.createLogger({
  level: 'info',
  format: alignedWithColorsAndTime,
  transports: [new winston.transports.Console(options.console), ...transports],
  exitOnError: false,
});

export default logger;

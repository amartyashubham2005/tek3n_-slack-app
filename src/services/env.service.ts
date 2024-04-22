import { cleanEnv, str } from 'envalid';

import AbstractService from './service';
import logger from '../utils/logger';

export type EnvVariables = {
  NODE_ENV: string;
  PORT: string;
  CLIENT_ID: string;
  CLIENT_SECRET: string;
  SIGNING_SECRET: string;
  BOT_ACCESS_TOKEN: string;
  BOT_USER_ID: string;
  SEARCH_ENGINE_ID: string;
  GOOGLE_API_KEY: string;
};

/*
 * This service is responsible for loading environment variables
 */
class EnvService implements AbstractService {
  static envVariables = {
    NODE_ENV: str({
      choices: ['development', 'staging', 'debug', 'production'],
    }),
    PORT: str(),
    CLIENT_ID: str(),
    CLIENT_SECRET: str(),
    SIGNING_SECRET: str(),
    BOT_ACCESS_TOKEN: str(),
    BOT_USER_ID: str(),
    SEARCH_ENGINE_ID: str(),
    GOOGLE_API_KEY: str(),
  };

  static envs: Readonly<EnvVariables>;

  // This is an idempotent operation, you can call init as many times as you want
  static init(): void {
    this.envs = cleanEnv(process.env, EnvService.envVariables, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reporter: ({ errors }: { errors: any }) => {
        if (Object.keys(errors).length > 0) {
          logger.error(`Invalid env vars: ${Object.keys(errors)}`);
        }
      },
    });

    logger.info(`Loaded env and running in env ${process.env.NODE_ENV}`);
  }

  static env(): Readonly<EnvVariables> {
    return (
      this.envs ?? {
        NODE_ENV: 'test',
        PORT: '3001',
      }
    );
  }
}

export default EnvService;

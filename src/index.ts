import dotenv from 'dotenv';
dotenv.config();

import App from './app';
import EventController from './controllers/event.controller';
import InitService from './services/init.service';

InitService.init().then(async () => {
  const app = new App([
    new EventController(),
  ]);
  app.listen();
});

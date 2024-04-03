import EnvService from './env.service';

class InitService {
  public static async init() {
    EnvService.init();
    return null;
  }
}

export default InitService;

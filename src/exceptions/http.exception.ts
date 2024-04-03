class HttpException extends Error {
  public status: number;
  public message: string;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.message = message;
  }
}

export class Error401Exception extends HttpException {
  constructor() {
    super(401, "You're not authorized");
  }
}

export default HttpException;

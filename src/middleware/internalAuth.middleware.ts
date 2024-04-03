import express from 'express';
import jwt from 'jsonwebtoken';
import { DateTime } from 'luxon';
import EnvService from '../services/env.service';
import { Error401Exception } from '../exceptions/http.exception';

interface AuthenticationTokenPayload {
  url: string;
  body: string;
  iss: string;
  exp: number;
}

async function internalAuthMiddleware(
  request: express.Request,
  _response: express.Response,
  next: express.NextFunction
) {
  const internalToken =
    request.headers['X-GALARM-SIGNATURE'] ||
    request.headers['X-GALARM-SIGNATURE'.toLowerCase()];

  if (internalToken && typeof internalToken === 'string') {
    const secret = EnvService.env().JWT_SECRET;
    try {
      const verificationResponse = jwt.verify(
        internalToken,
        secret
      ) as AuthenticationTokenPayload;
      if (
        verificationResponse.iss === 'Galarm' &&
        verificationResponse.exp > DateTime.utc().toSeconds() &&
        verificationResponse.url === request.url &&
        (request.method === 'GET'
          ? JSON.stringify({})
          : JSON.stringify(request.body)) === verificationResponse.body
      ) {
        // Success
        next();
      } else {
        // Throw exception
        next(new Error401Exception());
      }
    } catch (error) {
      // Throw exception
      next(new Error401Exception());
    }
  } else {
    // Throw exception
    next(new Error401Exception());
  }
}

export default internalAuthMiddleware;

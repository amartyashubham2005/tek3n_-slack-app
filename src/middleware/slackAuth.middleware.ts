import { NextFunction, Request, Response } from 'express';
import * as crypto from 'node:crypto';

import { Error401Exception } from '../exceptions/http.exception';
import EnvService from '../services/env.service';
import querystring from 'querystring';

// Adhering to RFC 3986
// Inspired from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
function fixedEncodeURIComponent(str: string) {
  return str.replace(/[!'()*~]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

// Inspired from https://github.com/gverni/validate-slack-request/blob/master/index.js
function validateSlackRequest(
  slackAppSigningSecret: string,
  httpReq: Request
): boolean {
  if (
    !slackAppSigningSecret ||
    typeof slackAppSigningSecret !== 'string' ||
    slackAppSigningSecret === ''
  ) {
    return false;
  }
  const xSlackRequestTimeStamp = httpReq.get('x-slack-request-timestamp');
  const SlackSignature = httpReq.get('x-slack-signature');
  const contentType = httpReq.get('content-type');
  let bodyPayload = '';
  if (
    contentType?.toLocaleLowerCase() === 'application/x-www-form-urlencoded'
  ) {
    bodyPayload = fixedEncodeURIComponent(
      querystring.stringify(httpReq.body).replace(/%20/g, '+')
    );
  } else {
    bodyPayload = JSON.stringify(httpReq.body)
      .replace(/\//g, '\\/')
      .replace(
        /[\u007f-\uffff]/g,
        (c) => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4)
      );
  }
  if (!(xSlackRequestTimeStamp && SlackSignature && bodyPayload)) {
    return false;
  }
  const baseString = 'v0:' + xSlackRequestTimeStamp + ':' + bodyPayload;
  const hash =
    'v0=' +
    crypto
      .createHmac('sha256', slackAppSigningSecret)
      .update(baseString)
      .digest('hex');

  return SlackSignature === hash;
}

function slackAuthMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction
) {
  if (!validateSlackRequest(EnvService.env().SIGNING_SECRET, request)) {
    next(new Error401Exception());
    // Make linter happy.
    return;
  }
  next();
}

export default slackAuthMiddleware;

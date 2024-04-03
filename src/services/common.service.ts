import axios from 'axios';
import ThreadMessageI from '../interfaces/threadMessages.interface';
import logger, { prettyJSON } from '../utils/logger';

class CommonService {

  // 

  // Slack APIs

  public async postMessageInDm({
    botAccessToken,
    sink,
    text,
    ts,
    blocks,
    metadata,
  }: {
    botAccessToken: string;
    sink: string;
    text: string;
    ts?: string;
    blocks?: string;
    metadata?: string;
  }): Promise<
    | {
        message: ThreadMessageI;
        channel: string;
        ts: string;
        ok: boolean;
      }
    | undefined
  > {
    let body = {
      channel: sink,
      text,
      metadata,
    } as any;
    if (blocks) {
      body = {
        ...body,
        blocks,
      };
    }
    if (ts) {
      body = {
        ...body,
        thread_ts: ts,
      };
    }
    try {
      const response = await axios.post(
        `https://slack.com/api/chat.postMessage`,
        body,
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
          },
        }
      );
      if (!response || response.status != 200 || response.data.ok === false) {
        throw Error(
          `Failed to post chat, request body: ${prettyJSON(
            body
          )} response status: ${response.status} response data: ${prettyJSON(
            response.data
          )}`
        );
      }
      return response.data as {
        message: ThreadMessageI;
        channel: string;
        ts: string;
        ok: boolean;
      };
    } catch (e: any) {
      logger.error(`Error posting message to ${sink}`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    return undefined;
  }

  public async postEphemeralMessage({
    botAccessToken,
    sink,
    userId,
    text,
    ts,
    blocks,
    metadata,
  }: {
    botAccessToken: string;
    sink: string;
    userId: string;
    text: string;
    ts?: string;
    blocks?: string;
    metadata?: string;
  }): Promise<
    | {
        message: ThreadMessageI;
        channel: string;
        ts: string;
        ok: boolean;
      }
    | undefined
  > {
    let body = {
      channel: sink,
      text,
      user: userId,
      metadata,
    } as any;
    if (blocks) {
      body = {
        ...body,
        blocks,
      };
    }
    if (ts) {
      body = {
        ...body,
        thread_ts: ts,
      };
    }
    try {
      const response = await axios.post(
        `https://slack.com/api/chat.postEphemeral`,
        body,
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
          },
        }
      );
      if (!response || response.status != 200 || response.data.ok === false) {
        throw Error(
          `Failed to post ephemeral chat, request body: ${prettyJSON(
            body
          )} response status: ${response.status} response data: ${prettyJSON(
            response.data
          )}`
        );
      }
      return response.data as {
        message: ThreadMessageI;
        channel: string;
        ts: string;
        ok: boolean;
      };
    } catch (e: any) {
      logger.error(`Error posting message to ${sink}`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    return undefined;
  }

  public async getMessagesFromDm({
    botAccessToken,
    userId,
    limit,
    cursor,
  }: {
    botAccessToken: string;
    userId: string;
    limit: number;
    cursor?: string;
  }): Promise<
    | {
        ok: boolean;
        messages: ThreadMessageI[];
        response_metadata: {
          next_cursor: string;
        };
      }
    | undefined
  > {
    try {
      const response0 = await axios.get(
        `https://slack.com/api/users.conversations?types=im&user=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
          },
        }
      );
      const response = await axios.get(
        `https://slack.com/api/conversations.history?channel=${
          response0.data.channels[0].id
        }&limit=${limit}&cursor=${cursor ?? ''}`,
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
          },
        }
      );
      if (!response || response.status != 200 || response.data.ok === false) {
        throw Error(
          `Failed to get chat, response status: ${
            response.status
          } response data: ${prettyJSON(response.data)}`
        );
      }
      return response.data as {
        ok: boolean;
        messages: ThreadMessageI[];
        response_metadata: {
          next_cursor: string;
        };
      };
    } catch (e: any) {
      logger.error(`Error getting message from ${userId}`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    logger.error(`Failed to get messages from DM 2`);
    return undefined;
  }

  public async getMessageFromDmUsingTs({
    botAccessToken,
    userId,
    messageTs,
  }: {
    botAccessToken: string;
    userId: string;
    messageTs: string;
  }): Promise<
    | {
        ok: boolean;
        messages: ThreadMessageI[];
        response_metadata: {
          next_cursor: string;
        };
      }
    | undefined
  > {
    try {
      const response0 = await axios.get(
        `https://slack.com/api/users.conversations?types=im&user=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
          },
        }
      );
      const response = await axios.get(
        `https://slack.com/api/conversations.history?channel=${response0.data.channels[0].id}&limit=1&latest=${messageTs}`,
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
          },
        }
      );
      if (!response || response.status != 200 || response.data.ok === false) {
        throw Error(
          `Failed to get chat, response status: ${
            response.status
          } response data: ${prettyJSON(response.data)}`
        );
      }
      return response.data as {
        ok: boolean;
        messages: ThreadMessageI[];
        response_metadata: {
          next_cursor: string;
        };
      };
    } catch (e: any) {
      logger.error(`Error getting message from ${userId}`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    logger.error(`Failed to get messages from DM 2`);
    return undefined;
  }

  public async getPermalink({
    botAccessToken,
    channelId,
    messageTs,
  }: {
    botAccessToken: string;
    channelId: string;
    messageTs: string;
  }): Promise<
    | {
        ok: boolean;
        permalink: string;
        channel: string;
      }
    | undefined
  > {
    try {
      const response = await axios.get(
        `https://slack.com/api/chat.getPermalink?channel=${channelId}&message_ts=${messageTs}`,
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
          },
        }
      );
      if (!response || response.status != 200 || response.data.ok === false) {
        throw Error(
          `Failed to get permalink, response status: ${
            response.status
          } response data: ${prettyJSON(response.data)}`
        );
      }
      return response.data;
    } catch (e: any) {
      logger.error(`Error getting permalink`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    logger.error(`Failed to get messages from DM 2`);
    return undefined;
  }

  public async getUser({
    botAccessToken,
    userId,
  }: {
    botAccessToken: string;
    userId: string;
  }): Promise<
    | {
        ok: boolean;
        user: any;
      }
    | undefined
  > {
    try {
      const response = await axios.get(
        `https://slack.com/api/users.info?user=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
          },
        }
      );
      if (!response || response.status != 200 || response.data.ok === false) {
        throw Error(
          `Failed to get user, response status: ${
            response.status
          } response data: ${prettyJSON(response.data)}`
        );
      }
      return response.data;
    } catch (e: any) {
      logger.error(`Error getting user`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    logger.error(`Failed to get messages from DM 2`);
    return undefined;
  }

  public async respondUsingResponseUrl({
    responseUrl,
    userId,
    text,
  }: {
    responseUrl: string;
    userId: string;
    text: string;
  }): Promise<
    | {
        ok: boolean;
        messages: ThreadMessageI[];
        response_metadata: {
          next_cursor: string;
        };
      }
    | undefined
  > {
    try {
      const response = await axios.post(
        responseUrl,
        {
          text,
          response_type: 'in_channel',
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response || response.status != 200 || response.data.ok === false) {
        throw Error(
          `Failed to get chat, response status: ${
            response.status
          } response data: ${prettyJSON(response.data)}`
        );
      }
      return response.data as {
        ok: boolean;
        messages: ThreadMessageI[];
        response_metadata: {
          next_cursor: string;
        };
      };
    } catch (e: any) {
      logger.error(`Error getting message from ${userId}`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    logger.error(`Failed to get messages from DM 2`);
    return undefined;
  }
}

export default CommonService;

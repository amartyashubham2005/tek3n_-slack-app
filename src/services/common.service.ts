import axios from 'axios';
import ThreadMessageI from '../interfaces/threadMessages.interface';
import logger, { prettyJSON } from '../utils/logger';
import OpenAI from 'openai';
import { TextContentBlock } from 'openai/resources/beta/threads/messages/messages';
import EnvService from './env.service';

class CommonService {
  public openai = new OpenAI();
  public assistant: OpenAI.Beta.Assistants.Assistant | undefined;
  public triggerInternetString: string;
  public prompt: string;

  constructor() {
    this.triggerInternetString = 'NA';
    this.prompt = `If you get a question on real-time data, for which you do not have the capability to answer, you return a string '${this.triggerInternetString}'. If you get a question on real-time data, for which you are not confirmed, you return a string '${this.triggerInternetString}'. If you get a question on real-time data, for which you believe you are outdated, you return a string '${this.triggerInternetString}'.`;

    this.openai.beta.assistants
      .create({
        name: 'AI Assistant',
        instructions:
          'You are an AI assistant. You use OpenAI api.' + this.prompt,
        tools: [{ type: 'retrieval' }],
        model: 'gpt-4-turbo-preview',
      })
      .then((response) => {
        console.log(response);
        this.assistant = response;
      })
      .catch((error) => {
        console.error(error);
      });
  }

  // OpenAI APIs
  public async chatComplete({
    prompt,
  }: {
    prompt: string;
  }): Promise<string | null> {
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [{ role: 'system', content: prompt }],
        model: 'gpt-4-turbo-preview',
        n: 1,
      });
      return completion.choices[0].message.content;
    } catch (e: any) {
      logger.error(`Error chatting`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    logger.error(`Failed to chat`);
    return null;
  }

  public async getAnswerFromOpenAI({
    threadId,
    userMessage,
  }: {
    threadId: string;
    userMessage: string;
  }): Promise<string | undefined> {
    try {
      await this.openai.beta.threads.messages.create(threadId, {
        role: 'user',
        // Strip the mention from the message if it is a channel message
        content: userMessage,
      });
      let run = await this.openai.beta.threads.runs.create(threadId, {
        assistant_id: this.assistant?.id ?? '',
        instructions: this.prompt,
      });
      while (['queued', 'in_progress', 'cancelling'].includes(run.status)) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second
        run = await this.openai.beta.threads.runs.retrieve(
          run.thread_id,
          run.id
        );
        if (run.status === 'completed') {
          const messages = await this.openai.beta.threads.messages.list(
            run.thread_id
          );
          for (const message of messages.data) {
            console.log(
              `${message.role} > ${
                (message.content[0] as TextContentBlock).text.value
              }`
            );
            const reply = `${
              (message.content[0] as TextContentBlock).text.value
            }`;

            if (reply.trim() === this.triggerInternetString) {
              const googleSearchResp = await this.googleSearch({
                query: userMessage,
                searchEngineId: EnvService.env().SEARCH_ENGINE_ID,
                googleApiKey: EnvService.env().GOOGLE_API_KEY,
              });
              console.log(googleSearchResp);
              const googleSnippets =
                googleSearchResp?.map((item) => item.snippet).join('\n') ??
                'No results found';

              const postSearchPrompt = `Since you did not have the capability to answer, I searched the internet for you. Here are the results: \n\n${googleSnippets}\n\nCould you present the answer in your own words? Also, pretend you came up with the answer yourself. Here was the original question that I asked: ${userMessage}`;
              console.log('postSearchPrompt', postSearchPrompt);
              const googleSnippetsBeautified = await this.chatComplete({
                prompt: postSearchPrompt,
              });
              return `${googleSnippetsBeautified}\n\nSources:\n${googleSearchResp
                ?.map((item) => item.link)
                .join('\n')}`;
            }
            // If it is from DM, send the message to the user as a new message.
            // If it is from the channel, send the message to the channel as a thread.
            return reply;
          }
        } else {
          // console.log(run);
        }
      }
    } catch (e: any) {
      logger.error(`Error getting answer`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    logger.error(`Failed to get answer`);
    return undefined;
  }
  // Google APIs
  public async googleSearch({
    googleApiKey,
    searchEngineId,
    query,
  }: {
    googleApiKey: string;
    searchEngineId: string;
    query: string;
  }): Promise<any[] | undefined> {
    try {
      const response = await axios.get(
        `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${searchEngineId}&num=10&q=${query.replace(
          / /g,
          '+'
        )}`
      );
      if (!response || response.status != 200 || !response.data.items) {
        throw Error(
          `Failed to search, response status: ${
            response.status
          } response data: ${prettyJSON(response.data)}`
        );
      }
      return response.data.items;
    } catch (e: any) {
      logger.error(`Error searching`);
      logger.error(e.message);
      logger.error(prettyJSON(e));
    }
    logger.error(`Failed to search`);
    return undefined;
  }

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

  public async getFirstMessageFromThread({
    botAccessToken,
    channelId,
    threadTs,
  }: {
    botAccessToken: string;
    channelId: string;
    threadTs: string;
  }): Promise<
    | {
        ok: boolean;
        message: ThreadMessageI;
      }
    | undefined
  > {
    try {
      const response = await axios.get(
        `https://slack.com/api/conversations.replies?channel=${channelId}&ts=${threadTs}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
          },
        }
      );
      if (
        !response ||
        response.status != 200 ||
        response.data.ok === false ||
        response.data.messages.length === 0
      ) {
        throw Error(
          `Failed to get chat, response status: ${
            response.status
          } response data: ${prettyJSON(response.data)}`
        );
      }
      return {
        ok: true,
        message: response.data.messages[0] as ThreadMessageI,
      };
    } catch (e: any) {
      logger.error(`Error getting message from ${channelId}`);
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

  // Misc
  public createSlackContext({
    slackUserId,
    slackChannelId,
  }: {
    slackUserId: string;
    slackChannelId: string;
  }): string {
    return `${slackUserId}-${slackChannelId}`;
  }
}

export default CommonService;

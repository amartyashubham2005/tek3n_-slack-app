import express from 'express';
import OpenAI from 'openai';
import fs from 'fs';

import Controller from '../interfaces/controller.interface';
import EventPayloadI from '../interfaces/eventPayload.interface';
import CommonService from '../services/common.service';
import logger, { prettyJSON } from '../utils/logger';
import slackAuthMiddleware from '../middleware/slackAuth.middleware';
import EnvService from '../services/env.service';
import { TextContentBlock } from 'openai/resources/beta/threads/messages/messages';

class EventController implements Controller {
  public router = express.Router();
  public commonService = new CommonService();
  public openai = new OpenAI();
  public assistant: OpenAI.Beta.Assistants.Assistant | undefined;

  // userSlackContextToThreadIdMap is a map from user's slack context to thread id
  public userSlackContextToThreadIdMap: { [key: string]: string };

  constructor() {
    this.initializeRoutes();
    // this.openai.models.list().then((response) => {
    //   console.log(response);
    // });
    this.openai.beta.assistants
      .create({
        name: 'ChatGPT Helper',
        instructions: 'You are a clone of ChatGPT',
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

    // Load the userSlackContextToThreadIdMap from the json file
    this.userSlackContextToThreadIdMap = JSON.parse(
      fs.readFileSync('userSlackContextToThreadIdMap.json', 'utf8')
    );
  }

  private initializeRoutes() {
    this.router.post(`/event`, slackAuthMiddleware, this.processEvent);
  }

  private processEvent = async (
    request: express.Request,
    response: express.Response
  ) => {
    if (request.body.type === 'url_verification') {
      response.send(request.body.challenge);
      return;
    }
    response.send();

    const payload = request.body as EventPayloadI;
    const { type, channel_type, thread_ts } = payload.event;
    if (type === 'message') {
      logger.info(`Received event payload: ${prettyJSON(payload)}`);
      if (channel_type === 'group') {
        if (thread_ts) {
          // This is a reply to a thread message. Check if the first message contained the bot mention.
          const threadFirstMessage =
            await this.commonService.getFirstMessageFromThread({
              botAccessToken: EnvService.env().BOT_ACCESS_TOKEN,
              channelId: payload.event.channel,
              threadTs: thread_ts,
            });
          if (!threadFirstMessage?.message.text.includes('<@U06SC5BPG68>')) {
            return;
          }
        } else {
          // This is a new message in the channel. Check if the message contains the bot mention.
          if (!payload.event.text.includes('<@U06SC5BPG68>')) {
            return;
          }
        }
      }
      // Only reply to messages from users which are not bots. Just echo the message back
      if (payload.event.bot_id) {
        return;
      }
      // get the thread id for the user
      let threadId =
        this.userSlackContextToThreadIdMap[
          this.commonService.createSlackContext({
            slackUserId: payload.event.user,
            slackChannelId: payload.event.channel,
          })
        ];
      if (!threadId) {
        const thread = await this.openai.beta.threads.create();
        threadId = thread.id;
        this.userSlackContextToThreadIdMap[
          this.commonService.createSlackContext({
            slackUserId: payload.event.user,
            slackChannelId: payload.event.channel,
          })
        ] = threadId;
        // Dump the map to a json file
        fs.writeFileSync(
          'userSlackContextToThreadIdMap.json',
          JSON.stringify(this.userSlackContextToThreadIdMap, null, 2)
        );
      } else {
        // check if the thread is still active
        const thread = await this.openai.beta.threads.retrieve(threadId);
        // create a new thread if the thread is not returned
        if (!thread) {
          const newThread = await this.openai.beta.threads.create();
          threadId = newThread.id;
          this.userSlackContextToThreadIdMap[
            this.commonService.createSlackContext({
              slackUserId: payload.event.user,
              slackChannelId: payload.event.channel,
            })
          ] = threadId;
          // Dump the map to a json file
          fs.writeFileSync(
            'userSlackContextToThreadIdMap.json',
            JSON.stringify(this.userSlackContextToThreadIdMap, null, 2)
          );
        }
      }
      threadId =
        this.userSlackContextToThreadIdMap[
          this.commonService.createSlackContext({
            slackUserId: payload.event.user,
            slackChannelId: payload.event.channel,
          })
        ];
      await this.openai.beta.threads.messages.create(threadId, {
        role: 'user',
        // Strip the mention from the message if it is a channel message
        content: payload.event.text.replace(/<@.*>/, '').trim(),
      });
      let run = await this.openai.beta.threads.runs.create(threadId, {
        assistant_id: this.assistant?.id ?? '',
        instructions: `Please address the user as <@${payload.event.user}>.`,
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
            // If it is from DM, send the message to the user as a new message.
            // If it is from the channel, send the message to the channel as a thread.
            await this.commonService.postMessageInDm({
              botAccessToken: EnvService.env().BOT_ACCESS_TOKEN,
              sink:
                channel_type === 'im'
                  ? payload.event.user
                  : payload.event.channel,
              text: `${(message.content[0] as TextContentBlock).text.value}`,
              ...(channel_type === 'im' ? {} : { ts: payload.event.ts }),
            });

            // Need to take only the last message
            break;
          }
        } else {
          console.log(run);
        }
      }
    }
  };
}

export default EventController;

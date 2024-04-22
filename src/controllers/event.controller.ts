import express from 'express';
import fs from 'fs';

import Controller from '../interfaces/controller.interface';
import EventPayloadI from '../interfaces/eventPayload.interface';
import CommonService from '../services/common.service';
import logger, { prettyJSON } from '../utils/logger';
import slackAuthMiddleware from '../middleware/slackAuth.middleware';
import EnvService from '../services/env.service';

class EventController implements Controller {
  public router = express.Router();
  public commonService = new CommonService();

  // userSlackContextToThreadIdMap is a map from user's slack context to thread id
  public userSlackContextToThreadIdMap: { [key: string]: string };

  constructor() {
    this.initializeRoutes();

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
      if (channel_type === 'group' || channel_type == 'mpim') {
        if (thread_ts) {
          // This is a reply to a thread message. Check if the first message contained the bot mention.
          const threadFirstMessage =
            await this.commonService.getFirstMessageFromThread({
              botAccessToken: EnvService.env().BOT_ACCESS_TOKEN,
              channelId: payload.event.channel,
              threadTs: thread_ts,
            });
          if (!threadFirstMessage?.message.text.includes(`<@${EnvService.env().BOT_USER_ID}>`)) {
            return;
          }
        } else {
          // This is a new message in the channel. Check if the message contains the bot mention.
          if (!payload.event.text.includes(`<@${EnvService.env().BOT_USER_ID}>`)) {
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
        const thread = await this.commonService.openai.beta.threads.create();
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
        const thread = await this.commonService.openai.beta.threads.retrieve(
          threadId
        );
        // create a new thread if the thread is not returned
        if (!thread) {
          const newThread =
            await this.commonService.openai.beta.threads.create();
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
      const sink =
        channel_type === 'im' ? payload.event.user : payload.event.channel;

      const reply = await this.commonService.getAnswerFromOpenAI({
        threadId,
        userMessage: payload.event.text.replace(/<@.*>/, '').trim(),
      });
      logger.info(`Reply from OpenAI: ${prettyJSON(reply)}`);
      await this.commonService.postMessageInDm({
        botAccessToken: EnvService.env().BOT_ACCESS_TOKEN,
        sink,
        text: reply ?? 'I am sorry, I could not understand that.',
        ...(channel_type === 'im' ? {} : { ts: payload.event.ts }),
      });
    }
  };
}

export default EventController;

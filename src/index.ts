import { Bot, Context, Schema } from 'koishi'
import { format } from 'path'

export const name = 'mail-extractor'
export const inject = []

export interface Pattern {
  regex: string,
  modifier: string,
  format: string,
}
interface PatternRegExp {
  regex: RegExp,
  format: string
}
export interface Config {
  mails: string[],
  patterns: Pattern[],
  platform: any,
  sid: string,
  seeisonIds: string[]
  continue: boolean,
  sandbox: boolean,
}

export const Config: Schema<Config> = Schema.object({
  mails: Schema.array(Schema.string().description("邮件地址，如：`example@example.com`").required()).description('需要监听的邮件地址列表:`adapter-mail`的`selfId`字段').required(),
  patterns: Schema.array(
    Schema.object({
      regex: Schema.string().default(`\\b\\d{6,}\\b`).description("匹配正则表达式"),
      modifier: Schema.string().default(`igm`).description("[正则表达式修饰符](https://www.runoob.com/js/js-regexp.html)"),
      format: Schema.string().default("$0").description("输出的格式化样式，[使用$0-$9表示匹配到的组的内容](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/RegExp/n)\\\n 使用`{content}`表示邮件纯文本内容"),
    })
  ).default([]).description("邮件匹配规则列表"),

  platform: Schema.union(['onebot', 'kook', 'telegram', 'discord', 'lark', 'chronocat']).default('onebot').description('机器人平台'),
  sid: Schema.string().required().description('机器人id，用于获取Bot对象'),
  seeisonIds: Schema.array(Schema.string().required()).role('table').description('群聊/私聊对象id,私聊对象需在前方加上`private:`,如`private:123456`'),
  continue: Schema.boolean().default(false).description("匹配规则由低到高依次匹配，当匹配成功后是否继续匹配，开启后同一封邮件可能会发送多条消息"),
  sandbox: Schema.boolean().default(false).description("沙盒模式，开启后支持在沙盒发送邮件正文测试匹配结果")
})

export function apply(ctx: Context, config: Config) {
  let logger = ctx.logger(name);
  logger.info(`可用的邮件地址列表：${ctx.platform("mail").bots.map(bot => `${bot.selfId}`).join(", ")}`)
  let mails = config.mails;
  let patterns: PatternRegExp[] = config.patterns.map(p => ({
    regex: new RegExp(p.regex, p.modifier),
    format: p.format
  }));
  let seeisonIds = config.seeisonIds;
  let sid = config.sid;
  let platform = config.platform;
  let if_continue = config.continue;
  for (let mail of mails) {
    ctx.platform("mail").self(mail).on('message', (session) => {
      logger.info(`${session.platform},${session.channelId} => ${session.content}`)
      let content = session.content;
      for (let pattern of patterns) {
        let result = pattern.regex.exec(content);
        logger.info(`匹配结果：${result}`)
        if (result != null) {
          let output = pattern.format;
          result.forEach((str, i) => {
            output = output.replaceAll(`$${i}`, str)
          })
          output = output.replaceAll("{content}", content)
          let bot = ctx.bots.find(bot => bot.platform == platform && bot.selfId == sid);
          if (bot != null) {
            seeisonIds.forEach(seeisonId => {
              bot.createMessage(seeisonId, output);
            });
          } else {
            logger.error(`没有找到任何可发送的机器人,可用列表:[${ctx.bots.map((v) => `${v.platform},${v.selfId}`)}]`)
          }
          if (!if_continue) {
            return
          }
        }
      }
    })
  }
  if (config.sandbox) {
    ctx.on('message', (session) => {
      if (session.platform.startsWith("sandbox")) {
        logger.info(`${session.platform},${session.channelId} => ${session.content}`)
        let content = session.content;
        for (let pattern of patterns) {
          let result = pattern.regex.exec(content);
          if (result != null) {
            let output = pattern.format;
            result.forEach((str, i) => {
              output = output.replaceAll(`$${i}`, str)
              logger.info(`replace: $${i} => ${str}`)
            })
            output = output.replaceAll("{content}", content)
            let debugOutput = `${output}\n\n匹配结果：\n${result.map((str,i)=>`$${i} => ${str}`).join("\n")}`
            session.bot.createMessage(session.channelId, debugOutput)
            if (!if_continue) {
              return
            }
          }
        }
      }
    })
  }
}
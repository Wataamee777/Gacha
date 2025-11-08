// bot.js
import { Client, GatewayIntentBits } from 'discord.js';
import db from './db.js';
import 'dotenv/config';
import './web.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`${client.user.tag} がログインしました！`);
});

// メッセージ反応型ガチャ
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  try {
    // ID は文字列で統一
    const guildId = msg.guild.id.toString();
    const channelId = msg.channel.id.toString();
    const content = msg.content.trim();

    // ガチャ取得
    const gacha = await db.getGachaByChannelAndPlex(guildId, channelId, content);
    if (!gacha) return;

    // 使用時間更新
    await db.query(`UPDATE gachas SET last_used=NOW() WHERE id=$1`, [gacha.id]);

    // アイテム取得
    const items = await db.getItems(guildId, gacha.name);
    if (items.length === 0) return;

    // ランダム抽選（確率が 0〜100 の整数の場合）
    const roll = Math.random();
    let cumulative = 0;
    const result = items.find((i) => {
      cumulative += i.chance / 100;
      return roll < cumulative;
    }); 

    if (result) {
      await msg.reply(
        `🎉 ${msg.author.username} が **${result.item_name}**（${result.rarity}）を引いた！`
      );
    }
  } catch (err) {
    console.error('ガチャエラー:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);

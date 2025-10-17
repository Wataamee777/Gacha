import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { gachaCommand } from './commands/gacha.js';
import db from './db.js';
import 'dotenv/config';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.commands = new Collection();
client.commands.set(gachaCommand.data.name, gachaCommand);

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (command) await command.execute(interaction);
});

// メッセージ反応型ガチャ
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  const gacha = await db.getGachaByChannelAndPlex(msg.guild.id, msg.channel.id, msg.content);
  if (!gacha) return;

  await db.query(`UPDATE gachas SET last_used=NOW() WHERE id=$1`, [gacha.id]);
  const items = await db.getItems(gacha.guild_id, gacha.name);

  const roll = Math.random();
  let cumulative = 0;
  const result = items.find(i => {
    cumulative += i.chance;
    return roll < cumulative;
  });

  if (result) msg.reply(`🎉 ${msg.author.username} が **${result.name}**（${result.rarity}）を引いた！`);
});

client.login(process.env.DISCORD_TOKEN);

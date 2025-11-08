import { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import 'dotenv/config';
import db from './db.js';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID } = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // サーバー情報
    GatewayIntentBits.GuildMessages,    // サーバー内のメッセージ取得
    GatewayIntentBits.MessageContent    // メッセージ内容取得（必須）
  ]
});

// =============================
// コマンド定義
// =============================
const commands = [
  new SlashCommandBuilder()
    .setName('gachasite')
    .setDescription('公式サイトを開く')
].map(c => c.toJSON());

// =============================
// コマンド登録
// =============================
const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('command regist now...');
    await rest.put(
      Routes.applicationGuildCommands(DISCORD_CLIENT_ID),
      { body: commands }
    );
    console.log('✅ コマンド登録完了');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
})();

// =============================
// Bot起動＆コマンド反応
// =============================
client.once('ready', () => {
  console.log(`🤖 ログイン完了: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'gachasite') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('公式ガチャサイトを開く')
        .setStyle(ButtonStyle.Link)
        .setURL('https://gacha.sakurahp.f5.si')
    );

    await interaction.reply({
      content: 'こちらから公式ガチャサイトを開けます👇',
      components: [row],
      ephemeral: true
    });
  }
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.guild) return;

  // member.roles.cache を渡す
  const gacha = await db.getGachaByChannelAndPlex(
    msg.guild.id,
    msg.channel.id,
    msg.content,
    msg.member.roles.cache
  );
  if (!gacha) return;

  // roll 制限（例: 30秒毎に同じガチャは1回だけ）
  const lastUsed = gacha.last_used ? new Date(gacha.last_used) : null;
  if (lastUsed && Date.now() - lastUsed.getTime() < 30_000) return;

  // 使用時間更新
  await db.query(`UPDATE gachas SET last_used=NOW() WHERE id=$1`, [gacha.id]);

  // アイテム取得
  const items = await db.getItems(gacha.guild_id, gacha.name);

  // 確率抽選
  const roll = Math.random();
  let cumulative = 0;
  const result = items.find(i => {
    cumulative += i.chance / 100; // chance が % なら 0-1 に変換
    return roll < cumulative;
  });

  if (result) {
    msg.reply(`🎉 ${msg.author.username} が **${result.item_name}**（${result.rarity}）を引いた！`);
  }
});


client.login(DISCORD_BOT_TOKEN);

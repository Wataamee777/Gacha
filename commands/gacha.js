import { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import db from '../db.js';

config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// =============================
// スラッシュコマンド定義
// =============================
export const gachaCommand = {
  data: new SlashCommandBuilder()
    .setName('gacha')
    .setDescription('ガチャコマンド')
    .addSubcommand(sub =>
      sub.setName('dashboard')
        .setDescription('ガチャの管理サイト')
    )
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild_id = interaction.guild.id;

    if (sub === 'dashboard') {
      await interaction.reply(`https://gacha.sakurahp.f5.si/`);
    }
};

// =============================
// グローバルコマンド登録
// =============================
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('🌍 /gacha コマンド登録中...');
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: [gachaCommand.data.toJSON()] }
    );
    console.log('✅ /gacha コマンド登録完了');
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
}

// =============================
// イベント
// =============================
client.once('ready', () => {
  console.log(`🤖 ログイン成功: ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'gacha') {
    await gachaCommand.execute(interaction);
  }
});

// =============================
// 起動
// =============================
(async () => {
  await registerCommands();
  client.login(process.env.DISCORD_TOKEN);
})();

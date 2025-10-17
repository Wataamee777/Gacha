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
    .setDescription('ガチャ管理コマンド')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('ガチャ作成')
        .addStringOption(o => o.setName('name').setDescription('ガチャ名').setRequired(true))
        .addStringOption(o => o.setName('plex').setDescription('反応文言'))
        .addChannelOption(o => o.setName('channel').setDescription('チャンネル'))
        .addRoleOption(o => o.setName('role').setDescription('権限ロール'))
    )
    .addSubcommand(sub =>
      sub.setName('edit')
        .setDescription('ガチャ編集')
        .addStringOption(o => o.setName('name').setDescription('対象ガチャ').setRequired(true))
        .addStringOption(o => o.setName('editname').setDescription('新しい名前'))
        .addStringOption(o => o.setName('plex').setDescription('反応文言'))
        .addChannelOption(o => o.setName('channel').setDescription('チャンネル'))
        .addRoleOption(o => o.setName('role').setDescription('権限ロール'))
        .addIntegerOption(o => o.setName('delete_after_days').setDescription('削除日数'))
        .addBooleanOption(o => o.setName('delete_now').setDescription('即削除'))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild_id = interaction.guild.id;

    if (sub === 'create') {
      const name = interaction.options.getString('name');
      const plex = interaction.options.getString('plex') || name;
      const channel = interaction.options.getChannel('channel')?.id || null;
      const role = interaction.options.getRole('role')?.id || null;
      await db.addGacha(guild_id, { name, plex, channel, role });
      await interaction.reply(`✅ ガチャ「${name}」を作成しました！`);
    }

    if (sub === 'edit') {
      const name = interaction.options.getString('name');
      const edits = {
        editname: interaction.options.getString('editname'),
        plex: interaction.options.getString('plex'),
        channel: interaction.options.getChannel('channel')?.id,
        role: interaction.options.getRole('role')?.id,
        delete_after_days: interaction.options.getInteger('delete_after_days')
      };
      const delete_now = interaction.options.getBoolean('delete_now');
      if (delete_now) {
        await db.deleteGacha(guild_id, name);
        return interaction.reply(`🗑️ ガチャ「${name}」を即削除しました！`);
      }
      const updated = await db.updateGacha(guild_id, name, edits);
      if (updated) interaction.reply(`🛠️ ガチャ「${name}」を更新しました！`);
      else interaction.reply(`⚠️ ガチャ「${name}」が見つかりません。`);
    }
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
      Routes.applicationCommands(process.env.CLIENT_ID),
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

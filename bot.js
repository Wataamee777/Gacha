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

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID } = process.env;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
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

client.login(DISCORD_BOT_TOKEN);

import { SlashCommandBuilder } from 'discord.js';
import db from '../db.js';

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

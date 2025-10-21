// db.js
import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default {
  // === 共通SQL実行 ===
  query: (text, params) => pool.query(text, params),

  // === ガチャ関連 ===
  async addGacha(guild_id, gacha) {
    const res = await pool.query(
      `INSERT INTO gachas (guild_id, name, plex, channel_id, role_id, delete_after_days)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        guild_id,
        gacha.name,
        gacha.plex || gacha.name,
        gacha.channel || null,
        gacha.role || null,
        gacha.delete_after_days || null,
      ]
    );
    return res.rows[0];
  },

  async updateGacha(guild_id, name, edits) {
    const gacha = await pool.query(
      `SELECT * FROM gachas WHERE guild_id=$1 AND name=$2`,
      [guild_id, name]
    );
    if (!gacha.rows[0]) return null;
    const g = gacha.rows[0];

    const query = `
      UPDATE gachas SET 
        name=$1,
        plex=$2,
        channel_id=$3,
        role_id=$4,
        delete_after_days=$5
      WHERE guild_id=$6 AND name=$7
      RETURNING *`;

    const values = [
      edits.editname || g.name,
      edits.plex || g.plex,
      edits.channel || g.channel_id,
      edits.role || g.role_id,
      edits.delete_after_days || g.delete_after_days,
      guild_id,
      name,
    ];

    const updated = await pool.query(query, values);
    return updated.rows[0];
  },

  async getGachaByGuild(guild_id) {
    const res = await pool.query(
      `SELECT * FROM gachas WHERE guild_id=$1`,
      [guild_id]
    );
    return res.rows;
  },

  async getGachaByChannelAndPlex(guild_id, channel_id, content) {
    let query = 'SELECT * FROM gachas WHERE guild_id=$1';
    let params = [guild_id];

    if (channel_id) {
      query += ` AND channel_id=$${params.length + 1}`;
      params.push(channel_id);
    }

    if (content) {
      query += ` AND (plex=$${params.length + 1} OR name=$${params.length + 1})`;
      params.push(content);
    }

    const res = await pool.query(query, params);
    return res.rows[0];
  },

  // === アイテム関連 ===
  async getItems(guild_id, gacha_name) {
    const res = await pool.query(
      `SELECT * FROM gacha_items WHERE guild_id=$1 AND gacha_name=$2`,
      [guild_id, gacha_name]
    );
    return res.rows;
  },

  async addItem(guild_id, gacha_name, item) {
    const res = await pool.query(
      `INSERT INTO gacha_items (guild_id, gacha_name, item_name, rarity, chance)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [guild_id, gacha_name, item.name, item.rarity, item.chance]
    );
    return res.rows[0];
  },

  async updateItem(guild_id, gacha_name, item_name, edits) {
    const item = await pool.query(
      `SELECT * FROM gacha_items WHERE guild_id=$1 AND gacha_name=$2 AND item_name=$3`,
      [guild_id, gacha_name, item_name]
    );
    if (!item.rows[0]) return null;
    const i = item.rows[0];

    const updated = await pool.query(
      `UPDATE gacha_items
       SET item_name=$1, rarity=$2, chance=$3
       WHERE guild_id=$4 AND gacha_name=$5 AND item_name=$6
       RETURNING *`,
      [
        edits.editname || i.item_name,
        edits.rarity || i.rarity,
        edits.chance || i.chance,
        guild_id,
        gacha_name,
        item_name,
      ]
    );
    return updated.rows[0];
  },

  async deleteItem(guild_id, gacha_name, item_name) {
    await pool.query(
      `DELETE FROM gacha_items WHERE guild_id=$1 AND gacha_name=$2 AND item_name=$3`,
      [guild_id, gacha_name, item_name]
    );
    return true;
  },

  async deleteGacha(guild_id, gacha_name) {
    await pool.query(
      `DELETE FROM gachas WHERE guild_id=$1 AND name=$2`,
      [guild_id, gacha_name]
    );
    await pool.query(
      `DELETE FROM gacha_items WHERE guild_id=$1 AND gacha_name=$2`,
      [guild_id, gacha_name]
    );
  },
};

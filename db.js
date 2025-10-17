import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default {
  query: (text, params) => pool.query(text, params),

  async addGacha(guild_id, gacha) {
    const res = await pool.query(
      `INSERT INTO gachas (guild_id, name, plex, channel_id, role_id) 
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [guild_id, gacha.name, gacha.plex || gacha.name, gacha.channel || null, gacha.role || null]
    );
    return res.rows[0];
  },

  async updateGacha(guild_id, name, edits) {
    const gacha = await pool.query(`SELECT * FROM gachas WHERE guild_id=$1 AND name=$2`, [guild_id, name]);
    if (!gacha.rows[0]) return null;
    const g = gacha.rows[0];
    const query = `
      UPDATE gachas SET 
        name=$1,
        plex=$2,
        channel_id=$3,
        role_id=$4,
        delete_after_days=$5
      WHERE guild_id=$6 AND name=$7 RETURNING *`;
    const values = [
      edits.editname || g.name,
      edits.plex || g.plex,
      edits.channel || g.channel_id,
      edits.role || g.role_id,
      edits.delete_after_days || g.delete_after_days,
      guild_id,
      name
    ];
    const updated = await pool.query(query, values);
    return updated.rows[0];
  },

  async getGachaByChannelAndPlex(guild_id, channel_id, content) {
    const res = await pool.query(
      `SELECT * FROM gachas WHERE guild_id=$1 AND ($2 IS NULL OR channel_id=$2) AND ($3=plex OR $3=name)`,
      [guild_id, channel_id, content]
    );
    return res.rows[0];
  },

  async getItems(guild_id, gacha_name) {
    const res = await pool.query(
      `SELECT * FROM gacha_items WHERE guild_id=$1 AND gacha_name=$2`,
      [guild_id, gacha_name]
    );
    return res.rows;
  },

  async addItem(guild_id, gacha_name, item) {
    await pool.query(
      `INSERT INTO gacha_items (guild_id, gacha_name, item_name, rarity, chance) VALUES ($1,$2,$3,$4,$5)`,
      [guild_id, gacha_name, item.name, item.rarity, item.chance]
    );
  },

  async deleteGacha(guild_id, gacha_name) {
    await pool.query(`DELETE FROM gachas WHERE guild_id=$1 AND name=$2`, [guild_id, gacha_name]);
    await pool.query(`DELETE FROM gacha_items WHERE guild_id=$1 AND gacha_name=$2`, [guild_id, gacha_name]);
  }
};

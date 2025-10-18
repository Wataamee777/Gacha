// web.js
import express from 'express';
import session from 'express-session';
import pg from 'pg';
import pgSession from 'connect-pg-simple';
import fetch from 'node-fetch';
import db from './db.js';
import 'dotenv/config';

const app = express();

// ---------- Middleware ----------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use('/static', express.static('public'));

// ---------- Postgres セッションストア ----------
const PgStore = pgSession(session);
app.use(
  session({
    store: new PgStore({
      pool: db.pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'supersecret',
    resave: false,
    saveUninitialized: false,
    proxy: true, // ← Renderでは必須！
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7日
      secure: true,                    // HTTPS限定
      httpOnly: true,
      sameSite: "none",                // ← OAuth通過時にクッキー削除されないため必須！
    },
  })
);

// ---------- Discord OAuth URL ----------
const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${
  process.env.DISCORD_CLIENT_ID
}&redirect_uri=${encodeURIComponent(
  process.env.CALLBACK_URL
)}&response_type=code&scope=identify%20guilds`;

// ---------- Middleware: 認証チェック ----------
function checkAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
}

// ---------- Routes ----------

// 🏠 ホーム
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user || null });
});

// 🔑 Discordログイン
app.get('/auth/login', (req, res) => {
  res.redirect(discordAuthUrl);
});

// 🔁 Discordコールバック
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Error: missing code');

  try {
    // トークン取得
    const params = new URLSearchParams();
    params.append('client_id', process.env.DISCORD_CLIENT_ID);
    params.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', process.env.CALLBACK_URL);

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token)
      return res.status(401).send('Discord OAuth failed.');

    // ユーザー情報取得
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    req.session.user = user;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth Error:', err);
    res.status(500).send('Internal error during login');
  }
});

// 📊 ダッシュボード
app.get('/dashboard', checkAuth, (req, res) => {
  res.render('dashboard', { user: req.session.user });
});

// 🎰 ガチャ一覧
app.get('/gacha/:guildId', checkAuth, async (req, res) => {
  const gachas = (await db.query('SELECT * FROM gachas WHERE guild_id=$1', [req.params.guildId])).rows;
  res.render('gacha_list', { gachas, user: req.session.user, guildId: req.params.guildId });
});

// ➕ ガチャ作成
app.post('/gacha/:guildId/create', checkAuth, async (req, res) => {
  const { name, plex, channel, role, delete_after_days } = req.body;
  await db.addGacha(req.params.guildId, { name, plex, channel, role, delete_after_days });
  res.redirect(`/gacha/${req.params.guildId}`);
});

// ✏️ ガチャ編集
app.post('/gacha/:guildId/edit', checkAuth, async (req, res) => {
  const { name, editname, plex, channel, role, delete_after_days, delete_now } = req.body;
  if (delete_now) {
    await db.deleteGacha(req.params.guildId, name);
  } else {
    await db.updateGacha(req.params.guildId, name, { editname, plex, channel, role, delete_after_days });
  }
  res.redirect(`/gacha/${req.params.guildId}`);
});

// 🎁 アイテム追加
app.post('/gacha/:guildId/:gachaName/additem', checkAuth, async (req, res) => {
  const { name, rarity, probability } = req.body;
  const { guildId, gachaName } = req.params;

  if (!name) return res.status(400).send('Item name is required');
  await db.addItem(guildId, gachaName, { name, rarity, probability });

  res.redirect(`/gacha/${guildId}`);
});

// 🎨 アイテム編集
app.post('/gacha/:guildId/:gachaName/edititem', checkAuth, async (req, res) => {
  const { id, name, rarity, probability, delete_now } = req.body;
  const { guildId, gachaName } = req.params;

  if (delete_now) {
    await db.deleteItem(id);
  } else {
    await db.updateItem(id, { name, rarity, probability });
  }

  res.redirect(`/gacha/${guildId}`);
});

// 📦 JSONインポート
app.post('/gacha/:guildId/import', checkAuth, async (req, res) => {
  const data = req.body.json;
  for (const g of data) {
    await db.addGacha(req.params.guildId, g);
    for (const item of g.items || []) await db.addItem(req.params.guildId, g.name, item);
  }
  res.redirect(`/gacha/${req.params.guildId}`);
});

// 💾 JSONエクスポート
app.get('/gacha/:guildId/export', checkAuth, async (req, res) => {
  const gachas = (await db.query('SELECT * FROM gachas WHERE guild_id=$1', [req.params.guildId])).rows;
  for (const g of gachas) g.items = await db.getItems(req.params.guildId, g.name);
  res.json(gachas);
});

// 🚪 ログアウト
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web管理画面起動: ${PORT}`));

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

// ---------- Postgresセッションストア ----------
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
    proxy: true,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7日間
      secure: true,
      httpOnly: true,
      sameSite: 'none',
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

// ---------- Discord API関数 ----------
async function getUserGuilds(token) {
  const res = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return await res.json();
}

// ---------- Routes ----------

// 🏠 ホーム
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user || null });
});

// 🔑 Discordログイン
app.get('/auth/login', (req, res) => res.redirect(discordAuthUrl));

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
    req.session.token = tokenData.access_token;
    res.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth Error:', err);
    res.status(500).send('Internal error during login');
  }
});

// 📋 サーバー一覧（Bot導入済みギルドのみ）
app.get('/dashboard', checkAuth, async (req, res) => {
  const guilds = await getUserGuilds(req.session.token);
  const botGuilds = guilds.filter((g) => (g.permissions & 0x20) !== 0); // 管理権限持ちのみ
  res.render('dashboard-list', { guilds: botGuilds, user: req.session.user });
});

// 🎛️ サーバー個別ダッシュボード
app.get('/dashboard/:guildId', checkAuth, async (req, res) => {
  const guildId = req.params.guildId;
  const gachas = (await db.query('SELECT * FROM gachas WHERE guild_id=$1', [guildId])).rows;

  for (const g of gachas) g.items = await db.getItems(guildId, g.name);
  res.render('dashboard', { guildId, gachas, user: req.session.user });
});

// 🎰 ガチャ作成
app.post('/gacha/:guildId/create', checkAuth, async (req, res) => {
  const { name, plex, channel, role, delete_after_days } = req.body;
  await db.addGacha(req.params.guildId, { name, plex, channel, role, delete_after_days });
  res.redirect(`/dashboard/${req.params.guildId}`);
});

// ✏️ ガチャ編集
app.post('/gacha/:guildId/:gachaName/edit', checkAuth, async (req, res) => {
  const { editname, plex, channel, role, delete_after_days, delete_now } = req.body;
  if (delete_now) {
    await db.deleteGacha(req.params.guildId, req.params.gachaName);
  } else {
    await db.updateGacha(req.params.guildId, req.params.gachaName, {
      editname,
      plex,
      channel,
      role,
      delete_after_days,
    });
  }
  res.redirect(`/dashboard/${req.params.guildId}`);
});

// 🎁 アイテム追加
app.post('/gacha/:guildId/:gachaName/additem', checkAuth, async (req, res) => {
  const { name, rarity, probability } = req.body;
  await db.addItem(req.params.guildId, req.params.gachaName, { name, rarity, probability });
  res.redirect(`/dashboard/${req.params.guildId}`);
});

// ✏️ アイテム編集・削除
app.post('/gacha/:guildId/:gachaName/edititem/:itemName', checkAuth, async (req, res) => {
  const { new_name, rarity, chance, delete_now } = req.body;
  if (delete_now) {
    await db.deleteItem(req.params.guildId, req.params.gachaName, req.params.itemName);
  } else {
    await db.updateItem(req.params.guildId, req.params.gachaName, req.params.itemName, {
      new_name,
      rarity,
      chance,
    });
  }
  res.redirect(`/dashboard/${req.params.guildId}`);
});

// 🚪 ログアウト
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ---------- 起動 ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web管理画面起動: ${PORT}`));

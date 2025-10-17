import express from 'express';
import session from 'express-session';
import pg from 'pg';
import pgSession from 'connect-pg-simple';
import fetch from 'node-fetch';
import db from './db.js'; // 既存のPG接続
import 'dotenv/config';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------- Postgres セッションストア ----------
const PgStore = pgSession(session);

app.use(session({
  store: new PgStore({
    pool: db.pool, // db.js 内の pg Pool を利用
    tableName: 'session',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7日間保持
    secure: process.env.NODE_ENV === 'production', // HTTPS の場合だけ
    sameSite: 'lax'
  }
}));

// ---------- view ----------
app.set('view engine', 'ejs');
app.use('/static', express.static('public'));

// ---------- Discord OAuth2 URL ----------
const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DISCORD_CALLBACK)}&response_type=code&scope=identify%20guilds`;

// ---------- 認証チェック ----------
const checkAuth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
};

// ---------- ログイン ----------
app.get('/auth/login', (req, res) => {
  res.redirect(discordAuthUrl);
});

// ---------- コールバック ----------
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('Error: code missing');

  const params = new URLSearchParams();
  params.append('client_id', process.env.DISCORD_CLIENT_ID);
  params.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', process.env.CALLBACK_URL);

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  const tokenData = await tokenRes.json();

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const user = await userRes.json();

  req.session.user = user;
  res.redirect('/dashboard');
});

// ---------- ダッシュボード ----------
app.get('/dashboard', checkAuth, (req, res) => {
  res.render('dashboard', { user: req.session.user });
});

// ---------- ホーム ----------
app.get('/', (req, res) => {
  res.render('index');
});

// ---------- ガチャ一覧 ----------
app.get('/gacha/:guildId', checkAuth, async (req, res) => {
  const gachas = (await db.query('SELECT * FROM gachas WHERE guild_id=$1', [req.params.guildId])).rows;
  res.render('gacha_list', { gachas, user: req.session.user, guildId: req.params.guildId });
});

// ---------- ガチャ作成 ----------
app.post('/gacha/:guildId/create', checkAuth, async (req, res) => {
  const { name, plex, channel, role, delete_after_days } = req.body;
  await db.addGacha(req.params.guildId, { name, plex, channel, role, delete_after_days });
  res.redirect(`/gacha/${req.params.guildId}`);
});

// ---------- ガチャ編集 ----------
app.post('/gacha/:guildId/edit', checkAuth, async (req, res) => {
  const { name, editname, plex, channel, role, delete_after_days, delete_now } = req.body;

  if (delete_now) {
    await db.deleteGacha(req.params.guildId, name);
    return res.redirect(`/gacha/${req.params.guildId}`);
  }

  const edits = { editname, plex, channel, role, delete_after_days };
  await db.updateGacha(req.params.guildId, name, edits);

  res.redirect(`/gacha/${req.params.guildId}`);
});

// ---------- JSONインポート ----------
app.post('/gacha/:guildId/import', checkAuth, async (req, res) => {
  const data = req.body.json;
  for (const g of data) {
    await db.addGacha(req.params.guildId, g);
    for (const item of g.items || []) await db.addItem(req.params.guildId, g.name, item);
  }
  res.redirect(`/gacha/${req.params.guildId}`);
});

// ---------- JSONエクスポート ----------
app.get('/gacha/:guildId/export', checkAuth, async (req, res) => {
  const gachas = (await db.query('SELECT * FROM gachas WHERE guild_id=$1', [req.params.guildId])).rows;
  for (const g of gachas) g.items = await db.getItems(req.params.guildId, g.name);
  res.json(gachas);
});

app.listen(3000, () => console.log('Web管理画面 http://localhost:3000'));

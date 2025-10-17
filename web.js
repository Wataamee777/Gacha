import express from 'express';
import session from 'express-session';
import fetch from 'node-fetch';
import db from './db.js';
import 'dotenv/config';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));
app.set('view engine', 'ejs');

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

  // トークン取得
  const params = new URLSearchParams();
  params.append('client_id', process.env.DISCORD_CLIENT_ID);
  params.append('client_secret', process.env.DISCORD_CLIENT_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', process.env.DISCORD_CALLBACK);
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
  res.send(`<h1>ようこそ ${req.session.user.username}</h1>
    <a href="/gacha/list">ガチャ管理画面</a>`);
});

// ---------- ガチャ一覧 ----------
app.get('/gacha/:guildId', checkAuth, async (req, res) => {
  // サーバー管理権限を確認する場合は guilds の情報と照合
  const gachas = (await db.query('SELECT * FROM gachas WHERE guild_id=$1', [req.params.guildId])).rows;
  res.render('gacha_list', { gachas, user: req.session.user });
});

// ---------- ガチャ作成 ----------
app.post('/gacha/:guildId/create', checkAuth, async (req, res) => {
  const { name, plex, channel, role } = req.body;
  await db.addGacha(req.params.guildId, { name, plex, channel, role });
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

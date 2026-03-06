const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      deviceId   TEXT    UNIQUE NOT NULL,
      username   TEXT    UNIQUE NOT NULL,
      country    TEXT    NOT NULL DEFAULT 'US',
      trophys    INTEGER NOT NULL DEFAULT 0,
      crowns     INTEGER NOT NULL DEFAULT 0,
      experience INTEGER NOT NULL DEFAULT 0,
      gems       INTEGER NOT NULL DEFAULT 0,
      coins      INTEGER NOT NULL DEFAULT 0,
      banned     BOOLEAN NOT NULL DEFAULT false,
      createdAt  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

function randomNick() {
  const num = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000;
  return `PastPlayer#${num}`;
}

async function isNickTaken(username) {
  const res = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  return res.rows.length > 0;
}

async function generateUniqueNick() {
  let nick, attempts = 0;
  do {
    nick = randomNick();
    if (++attempts > 200) { nick = `PastPlayer#${Date.now() % 100000}`; break; }
  } while (await isNickTaken(nick));
  return nick;
}

app.get('/', (req, res) => {
  res.json({
    name:       'Game Backend',
    version:    '1.0.0',
    created_by: '@gztxx7',
    status:     'online'
  });
});

app.get('/ping', (req, res) => {
  res.json({ ok: true });
});

app.post('/user/login/', async (req, res) => {
  const { deviceId, country } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

  let result = await pool.query('SELECT * FROM users WHERE deviceId = $1', [deviceId]);
  let user = result.rows[0];

  if (!user) {
    const username = await generateUniqueNick();
    const inserted = await pool.query(
      'INSERT INTO users (deviceId, username, country) VALUES ($1, $2, $3) RETURNING *',
      [deviceId, username, country || 'US']
    );
    user = inserted.rows[0];
  }

  if (user.banned) return res.json({ banned: true });

  res.json({
    id:         user.id,
    username:   user.username,
    country:    user.country,
    trophys:    user.trophys,
    crowns:     user.crowns,
    experience: user.experience,
    gems:       user.gems,
    coins:      user.coins,
    banned:     false
  });
});

app.get('/user/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  const { deviceid: _, ...safe } = result.rows[0];
  res.json(safe);
});

app.get('/users', async (req, res) => {
  const result = await pool.query(
    'SELECT id, username, country, trophys, crowns, experience, gems, coins, banned, createdat FROM users ORDER BY id DESC LIMIT 100'
  );
  res.json({ total: result.rows.length, users: result.rows });
});

app.patch('/user/:id/ban', async (req, res) => {
  await pool.query('UPDATE users SET banned = $1 WHERE id = $2', [!!req.body.banned, req.params.id]);
  res.json({ ok: true });
});

app.patch('/user/:id', async (req, res) => {
  const allowed = ['username', 'trophys', 'crowns', 'experience', 'gems', 'coins', 'country'];
  const fields = [], values = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) { fields.push(`${key} = $${fields.length + 1}`); values.push(req.body[key]); }
  }
  if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
  values.push(req.params.id);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await setup();
});

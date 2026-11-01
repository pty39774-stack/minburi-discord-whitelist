require('dotenv').config();
const express = require('express');
const crypto = require('node:crypto');
const { Client, GatewayIntentBits } = require('discord.js');
const app = express();
app.use(express.json({ limit: '16kb' }));
const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, ROBLOX_API_SECRET } = process.env;
const GUILD_ID = '1546857600904335431';
const ROLE_ID = '1547211919285297174';
for (const k of ['DISCORD_BOT_TOKEN','DISCORD_CLIENT_ID','DISCORD_CLIENT_SECRET','DISCORD_REDIRECT_URI','ROBLOX_API_SECRET']) if (!process.env[k]) throw new Error('Missing '+k);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const codes = new Map();
const states = new Map();
const linked = new Map(); // Demo only: Render restart clears links. Use a database for production.
const now = () => Date.now();
const clean = () => { for (const [k,v] of codes) if (v.expires < now()) codes.delete(k); for (const [k,v] of states) if (v.expires < now()) states.delete(k); };
const secretOK = req => req.get('x-api-secret') === ROBLOX_API_SECRET;
async function hasRole(discordId) {
  if (!client.isReady()) return false;
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch({user: discordId, force: true});
    return member.roles.cache.has(ROLE_ID);
  } catch(e) { console.error('Role check failed:',e.message); return false; }
}
app.get('/', (_,res)=>res.send('MINBURI ZONE Whitelist Online'));
app.get('/health',(_,res)=>res.json({online:true,discordReady:client.isReady()}));
app.post('/api/link/start',(req,res)=>{
  if (!secretOK(req)) return res.sendStatus(403);
  const id = Number(req.body?.robloxUserId);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({error:'Invalid Roblox ID'});
  clean();
  for (const [k,v] of codes) if (v.robloxId === id) codes.delete(k);
  const code = crypto.randomBytes(16).toString('hex');
  codes.set(code,{robloxId:id,expires:now()+300000});
  res.json({code,url:`${req.protocol}://${req.get('host')}/auth/discord?link_code=${code}`,expiresIn:300});
});
app.get('/auth/discord',(req,res)=>{
  clean();
  const linkCode = String(req.query.link_code || '');
  if (!codes.has(linkCode)) return res.status(400).send('Start linking from Roblox first.');
  const state = crypto.randomBytes(24).toString('hex');
  states.set(state,{linkCode,expires:now()+300000});
  const qs = new URLSearchParams({client_id:DISCORD_CLIENT_ID,redirect_uri:DISCORD_REDIRECT_URI,response_type:'code',scope:'identify',state});
  res.redirect('https://discord.com/oauth2/authorize?'+qs);
});
app.get('/auth/discord/callback',async(req,res)=>{
  clean();
  const state = String(req.query.state || '');
  const record = states.get(state);
  states.delete(state);
  if (!record || !req.query.code) return res.status(400).send('Link expired. Start again in Roblox.');
  const pending = codes.get(record.linkCode);
  if (!pending) return res.status(400).send('Link expired. Start again in Roblox.');
  try {
    const tokenResp = await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:DISCORD_CLIENT_ID,client_secret:DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code:String(req.query.code),redirect_uri:DISCORD_REDIRECT_URI})});
if (!tokenResp.ok) {
  console.error('Discord OAuth token HTTP', tokenResp.status);
  console.error('Retry-After:', tokenResp.headers.get('retry-after'));
  console.error('RateLimit-Reset-After:', tokenResp.headers.get('x-ratelimit-reset-after')); return res.status(503).send('Discord temporarily unavailable. Try later.'); }
    const token = await tokenResp.json();
    const userResp = await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});
    if (!userResp.ok) return res.status(503).send('Discord user lookup unavailable.');
    const user = await userResp.json();
    if (!codes.has(record.linkCode)) return res.status(400).send('Link expired. Start again.');
    codes.delete(record.linkCode);
    linked.set(pending.robloxId,String(user.id));
    const allowed = await hasRole(String(user.id));
    res.type('text/plain').send(allowed ? 'MINBURI ZONE: Linked! Whitelist role found. Rejoin Roblox.' : 'MINBURI ZONE: Linked, but whitelist role not found. Ask staff for the role.');
  } catch(e) { console.error('OAuth failed:',e.message); res.status(503).send('Discord verification temporarily unavailable.'); }
});
app.post('/api/whitelist/check',async(req,res)=>{
  if (!secretOK(req)) return res.sendStatus(403);
  const id = Number(req.body?.robloxUserId);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({allowed:false});
  const discordId = linked.get(id);
  if (!discordId) return res.json({allowed:false,reason:'not_linked'});
  const allowed = await hasRole(discordId);
  res.json({allowed,reason:allowed?'ok':'role_missing'});
});
const port = process.env.PORT || 3000;
app.listen(port,()=>console.log('Listening on',port));
client.once('ready',()=>console.log('Discord bot ready'));
client.login(DISCORD_BOT_TOKEN).catch(e=>console.error('Discord bot login:',e.message));

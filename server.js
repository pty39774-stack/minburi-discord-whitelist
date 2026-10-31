
require("dotenv").config();

const express = require("express");
const crypto = require("node:crypto");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.use(express.json());

const GUILD_ID = "1546857600904335431";
const ROLE_ID = "1547211919285297174";
async function checkWhitelist(discordUserId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch({
      user: discordUserId,
      force: true
    });

    return member.roles.cache.has(ROLE_ID);
  } catch (error) {
    console.error("Whitelist check failed:", error.message);
    return false;
  }
}
const {
  DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  ROBLOX_API_SECRET
} = process.env;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// เก็บสถานะ OAuth ชั่วคราว
const pendingStates = new Map();

app.get("/", (req, res) => {
  res.send("MINBURI ZONE Whitelist Backend Online");
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    discordReady: client.isReady()
  });
});

// เริ่มเชื่อมบัญชี Discord
app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");

  pendingStates.set(state, Date.now() + 600000);

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state
  });

  res.redirect(
    "https://discord.com/oauth2/authorize?" +
    params.toString()
  );
});

// รับผลการยืนยันตัวตนจาก Discord
app.get("/auth/discord/callback", async (req, res) => {
  const { code, state } = req.query;
  const expires = pendingStates.get(state);

  if (!code || !expires || Date.now() > expires) {
    return res.status(400).send("Invalid or expired login");
  }

  pendingStates.delete(state);

  try {
    const tokenResponse = await fetch(
      "https://discord.com/api/v10/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: DISCORD_REDIRECT_URI
        })
      }
    );

if (!tokenResponse.ok) {
  const errorData = await tokenResponse.json();
  console.error("Discord OAuth error:", {
    error: errorData.error,
    description: errorData.error_description
  });
  throw new Error("Discord token exchange failed");
}

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch(
      "https://discord.com/api/v10/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    if (!userResponse.ok) {
      throw new Error("Discord user lookup failed");
    }

    const discordUser = await userResponse.json();

    // ยังไม่เชื่อมกับ Roblox ID ในขั้นตอนนี้
    res.send(
      "Discord verified: " +
      String(discordUser.username).replace(
        /[&<>"']/g,
        ""
      )
    );
  } catch (error) {
    console.error("OAuth error:", error.message);
    res.status(500).send("Discord verification failed");
  }
});

client.once("ready", () => {
  console.log("Discord Bot Connected");
});

const required = {
  DISCORD_BOT_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  ROBLOX_API_SECRET
};

for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.error("Missing " + key);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Backend running on port " + PORT);
});

client.login(DISCORD_BOT_TOKEN).catch(error => {
  console.error("Discord login failed:", error.message);
  process.exit(1);
});

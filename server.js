
require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.use(express.json());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const GUILD_ID = "1546857600904335431";
const ROLE_ID = "1547211919285297174";

app.get("/", (req, res) => {
  res.send("MINBURI ZONE Whitelist Backend Online");
});

app.get("/health", (req, res) => {
  res.json({ status: "online" });
});

client.once("ready", () => {
  console.log("Discord Bot Connected");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN");
  process.exit(1);
}

client.login(process.env.DISCORD_BOT_TOKEN);

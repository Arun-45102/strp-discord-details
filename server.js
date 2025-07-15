import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { WebSocketServer } from 'ws';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// Declare Port
const PORT = process.env.PORT;

// Express.JS & Websocket
const app = express();
app.use(cors());
const server = createServer(app);
const wss = new WebSocketServer({ server });
const UPDATE_INTERVAL = 5000;

// Discord.js
const TOKEN = process.env.TOKEN;
const SERVER_ID = process.env.SERVER_ID;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});
const ALLOWED_ROLES = [
  'CIVILIANS',
  'WAITING LIST',
  'MYTHIC',
  'MASTER',
  'CHAMPION',
  'HERO',
  'ADVENTURER',
];

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

const FIVEMID = process.env.FIVEMID;

async function getFivemData(FIVEM_SERVER_IP) {
  const url = `http://servers-frontend.fivem.net/api/servers/single/${FIVEM_SERVER_IP}`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'], });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 3000 });
    const bodyText = await page.evaluate(() => document.body.innerText);
    const data = JSON.parse(bodyText);
    return data;
  } catch (error) {
    console.log(error)
    console.error(
      '❌ Error fetching FiveM data:',
      error.response?.status,
      error.response?.statusText
    );
    return 'Error';
  } finally {
    await browser.close();
  }
}

// Get total member count from discord server
async function getMemberCount(guildId) {
  const guild = await client.guilds.fetch(guildId);
  return guild;
}

// Get total Online Members from discord server
async function getOnlineMembers(guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return 0;

  await guild.members.fetch();
  return guild.members.cache.filter(
    (member) => member.presence && member.presence.status !== 'offline'
  ).size;
}

// Get Member Count based on roles
async function getFilteredRoleCounts(guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return {};
  await guild.members.fetch();
  const roleCounts = {};
  guild.roles.cache.forEach((role) => {
    if (ALLOWED_ROLES.includes(role.name)) {
      const count = guild.members.cache.filter((member) =>
        member.roles.cache.has(role.id)
      ).size;
      roleCounts[role.name] = count;
    }
  });

  return roleCounts;
}

// Calling all the functions Above
async function getAllData() {
  try {
    const guild = await getMemberCount(SERVER_ID);
    const onlineCount = await getOnlineMembers(SERVER_ID);
    const rolesBasedCount = await getFilteredRoleCounts(SERVER_ID);
    const getFivemCount = await getFivemData(FIVEMID);
    return {
      count: guild.memberCount,
      onlineCount: onlineCount,
      rolesBasedCount: rolesBasedCount,
      getFivemCount: getFivemCount
    };
  } catch (error) {
    return { error: 'Error fetching member count' };
  }
}

// Websocket Connection
wss.on('connection', (ws) => {
  console.log('Client connected');

  const sendUpdates = async () => {
    const data = await getAllData();
    ws.send(JSON.stringify(data));
  };

  sendUpdates();
  // getFivemData(FIVEM_SERVER_IP);
  const interval = setInterval(sendUpdates, UPDATE_INTERVAL);

  ws.on('close', () => {
    clearInterval(interval);
    console.log('Client disconnected');
  });
});

client.login(TOKEN);
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

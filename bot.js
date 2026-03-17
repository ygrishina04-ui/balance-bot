require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const { google } = require("googleapis");

// ENV
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ===== ВСПОМОГАТЕЛЬНЫЕ =====

function formatNumber(value) {
  if (!value) return "0 ₽";

  const num = Number(String(value).replace(/\s/g, "").replace(",", "."));

  if (isNaN(num)) return value + " ₽";

  return new Intl.NumberFormat("ru-RU").format(num) + " ₽";
}

function toNumber(value) {
  const num = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return isNaN(num) ? 0 : num;
}

function getDiff(today, yesterday) {
  const diff = toNumber(today) - toNumber(yesterday);
  const abs = formatNumber(Math.abs(diff));

  if (diff > 0) return `(+${abs})`;
  if (diff < 0) return `(-${abs})`;
  return `(0 ₽)`;
}

function getDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(
    d.getMonth() + 1
  ).padStart(2, "0")}`;
}

// ===== GOOGLE SHEETS =====

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  return google.sheets({ version: "v4", auth });
}

async function getData() {
  const sheets = await getSheets();

  const ranges = [
    `${process.env.BALANCE_SHEET}!${process.env.BALANCE_CELL}`,
    `${process.env.BALANCE_SHEET}!${process.env.BALANCE_YESTERDAY_CELL}`,

    `${process.env.DEBIT_SHEET}!${process.env.DEBIT_CELL}`,
    `${process.env.DEBIT_SHEET}!${process.env.DEBIT_YESTERDAY_CELL}`,

    `${process.env.CREDIT_SHEET}!${process.env.CREDIT_CELL}`,
    `${process.env.CREDIT_SHEET}!${process.env.CREDIT_YESTERDAY_CELL}`
  ];

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: process.env.SPREADSHEET_ID,
    ranges
  });

  const v = res.data.valueRanges;

  return {
    balance: v[0]?.values?.[0]?.[0],
    balanceY: v[1]?.values?.[0]?.[0],

    debit: v[2]?.values?.[0]?.[0],
    debitY: v[3]?.values?.[0]?.[0],

    credit: v[4]?.values?.[0]?.[0],
    creditY: v[5]?.values?.[0]?.[0]
  };
}

// ===== СООБЩЕНИЕ =====

function buildMessage(data) {
  return `📊 БАЛАНС НА ${getDate()}

💰 Баланс: ${formatNumber(data.balance)} ${getDiff(
    data.balance,
    data.balanceY
  )}
🟢 Дебиторка: ${formatNumber(data.debit)} ${getDiff(
    data.debit,
    data.debitY
  )}
🔴 Кредиторка: ${formatNumber(data.credit)} ${getDiff(
    data.credit,
    data.creditY
  )}`;
}

// ===== ОТПРАВКА =====

async function sendReport() {
  try {
    const data = await getData();
    const text = buildMessage(data);

    await bot.sendMessage(process.env.GROUP_CHAT_ID, text);
    console.log("Отправлено");
  } catch (e) {
    console.error("Ошибка:", e.message);
  }
}

// ===== CRON (будни 13:00) =====

cron.schedule(
  "0 13 * * 1-5",
  () => {
    sendReport();
  },
  {
    timezone: process.env.TIMEZONE || "Asia/Vladivostok"
  }
);

// ===== КОМАНДЫ =====

bot.onText(/\/test/, async (msg) => {
  const data = await getData();
  bot.sendMessage(msg.chat.id, buildMessage(data));
});

bot.onText(/\/chatid/, (msg) => {
  bot.sendMessage(msg.chat.id, msg.chat.id.toString());
});

console.log("BOT STARTED");

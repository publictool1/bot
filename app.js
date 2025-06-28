// bot.js
// Приватный Telegram-бот для пары: общее хранилище и примирительные письма

const { Telegraf, session, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);

// Сессии
bot.use(session());
bot.use((ctx, next) => { if (!ctx.session) ctx.session = {}; return next(); });

// Общий ключ (shared) вместо chatId для пары
const STORAGE_KEY = 'shared';

// Пути к файлам хранения
const DATA_PATH = path.resolve(__dirname, 'wishlist.json');
const LETTERS_PATH = path.resolve(__dirname, 'letters.json');

// Загрузка данных
let data = fs.existsSync(DATA_PATH)
  ? JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
  : {};
let letters = fs.existsSync(LETTERS_PATH)
  ? JSON.parse(fs.readFileSync(LETTERS_PATH, 'utf8'))
  : [];

function saveData() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}
function saveLetters() {
  fs.writeFileSync(LETTERS_PATH, JSON.stringify(letters, null, 2));
}

// Безопасное редактирование сообщений
async function safeEdit(ctx, text, markup) {
  try {
    await ctx.editMessageText(text, markup);
  } catch (err) {
    if (!/message is not modified/.test(err.response?.description)) {
      console.error('Edit error:', err);
    }
  }
}

// Меню
const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('🎁 Вишлист', 'WISHLIST_MENU')],
  [Markup.button.callback('💌 Примирительные письма', 'LETTER_MENU')]
]);
const wishlistMenu = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Добавить пункт', 'ADD_WISH')],
  [Markup.button.callback('📜 Показать вишлист', 'VIEW_WISH')],
  [Markup.button.callback('🗑️ Удалить пункт', 'START_REMOVE')],
  [Markup.button.callback('🔙 Назад', 'BACK_MAIN')]
]);
const letterMenu = Markup.inlineKeyboard([
  [Markup.button.callback('✍️ Написать письмо', 'ADD_LETTER')],
  [Markup.button.callback('📬 Просмотреть письма', 'VIEW_LETTERS')],
  [Markup.button.callback('🗑️ Удалить письмо', 'DELETE_LETTERS_MENU')],
  [Markup.button.callback('🔙 Назад', 'BACK_MAIN')]
]);
const priorities = [
  { id: 1, label: '🔥 Очень хочу' },
  { id: 2, label: '🕒 Нужно скоро' },
  { id: 3, label: '🌿 Можно подождать' }
];

// Добавление желания
function addWish(text, priority) {
  if (!data[STORAGE_KEY]) data[STORAGE_KEY] = [];
  data[STORAGE_KEY].push({ text, priority, addedAt: new Date().toISOString() });
  saveData();
}

// Запуск бота
bot.start(ctx => {
  ctx.session = {};
  ctx.reply(`Привет, ${ctx.from.first_name}! Это ваш общий вишлист 💑`, mainMenu);
});

// Главное меню
bot.action('BACK_MAIN', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx, '📋 Главное меню:', mainMenu);
});

// --- Вишлист ---
bot.action('WISHLIST_MENU', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx, '🎁 Общее меню вишлиста:', wishlistMenu);
});
bot.action('ADD_WISH', async ctx => {
  ctx.session.action = 'awaiting_text';
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx, '✏️ Что добавить в общий вишлист?');
});
priorities.forEach(p => {
  bot.action(`SET_PRIORITY_${p.id}`, async ctx => {
    const text = ctx.session.tempWish;
    addWish(text, p.label);
    ctx.session.tempWish = null;
    ctx.session.action = null;
    await ctx.answerCbQuery().catch(() => {});
    await safeEdit(ctx, `✅ Добавлено: ${p.label} — ${text}`, wishlistMenu);
  });
});
bot.action('VIEW_WISH', async ctx => {
  const list = data[STORAGE_KEY] || [];
  const msg = list.length
    ? '📜 Общий вишлист:\n' + list.map((i, idx) => `${idx + 1}. ${i.priority} — ${i.text}`).join('\n')
    : '🏷️ Вишлист пуст.';
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx, msg, wishlistMenu);
});
bot.action('START_REMOVE', async ctx => {
  const list = data[STORAGE_KEY] || [];
  if (!list.length) {
    await ctx.answerCbQuery().catch(() => {});
    return safeEdit(ctx, 'Пусто. Нечего удалять.', wishlistMenu);
  }
  const buttons = list.map((item, idx) =>
    Markup.button.callback(`${idx + 1}. ${item.priority} — ${item.text}`, `REMOVE_${idx}`)
  );
  buttons.push(Markup.button.callback('❌ Отмена', 'WISHLIST_MENU'));
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx, 'Выбери пункт для удаления:', Markup.inlineKeyboard(buttons, { columns: 1 }));
});
bot.action(/REMOVE_(\d+)/, async ctx => {
  const idx = parseInt(ctx.match[1], 10);
  const list = data[STORAGE_KEY] || [];
  if (list[idx]) list.splice(idx, 1);
  saveData();
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx, '🎁 Меню вишлиста:', wishlistMenu);
});

// --- Примирительные письма ---
bot.action('LETTER_MENU', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx, '💌 Меню примирительных писем:', letterMenu);
});

bot.action('ADD_LETTER', async ctx => {
  ctx.session.action = 'awaiting_letter';
  await ctx.answerCbQuery().catch(() => {});
  await ctx.reply('✏️ Напиши своё примирительное письмо:');
});

// Список писем как кнопки
bot.action('VIEW_LETTERS', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  if (!letters.length) {
    return safeEdit(ctx, '📭 Писем пока нет.', letterMenu);
  }
  const buttons = letters.map((l, i) =>
    Markup.button.callback(
      `${i + 1}. от ${l.from} (${new Date(l.at).toLocaleDateString()})`,
      `VIEW_LETTER_${i}`
    )
  );
  buttons.push(Markup.button.callback('🔙 Назад', 'LETTER_MENU'));
  await safeEdit(ctx, '📬 Выберите письмо:', Markup.inlineKeyboard(buttons, { columns: 1 }));
});

// Показать конкретное письмо
bot.action(/VIEW_LETTER_(\d+)/, async ctx => {
  const idx = parseInt(ctx.match[1], 10);
  const l = letters[idx];
  await ctx.answerCbQuery().catch(() => {});
  if (!l) return safeEdit(ctx, '❗️ Письмо не найдено.', letterMenu);
  const text = `✉️ Письмо от ${l.from} (${new Date(l.at).toLocaleString()}):\n\n${l.text}`;
  await safeEdit(ctx, text, letterMenu);
});

// Меню удаления писем
bot.action('DELETE_LETTERS_MENU', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  if (!letters.length) {
    return safeEdit(ctx, '📭 Нет писем для удаления.', letterMenu);
  }
  const buttons = letters.map((l, i) =>
    Markup.button.callback(`${i + 1}. от ${l.from}`, `DELETE_LETTER_${i}`)
  );
  buttons.push(Markup.button.callback('❌ Отмена', 'LETTER_MENU'));
  await safeEdit(ctx, '🗑️ Выберите письмо для удаления:', Markup.inlineKeyboard(buttons, { columns: 1 }));
});

// Удаление выбранного письма
bot.action(/DELETE_LETTER_(\d+)/, async ctx => {
  const idx = parseInt(ctx.match[1], 10);
  if (letters[idx]) letters.splice(idx, 1);
  saveLetters();
  await ctx.answerCbQuery().catch(() => {});
  await safeEdit(ctx, '✅ Письмо удалено.', letterMenu);
});

// Обработка текста для вишлиста или письма
bot.on('text', async ctx => {
  if (ctx.session.action === 'awaiting_text') {
    ctx.session.tempWish = ctx.message.text.trim();
    ctx.session.action = 'awaiting_priority';
    const buttons = priorities.map(p =>
      Markup.button.callback(p.label, `SET_PRIORITY_${p.id}`)
    );
    await ctx.reply('Выбери приоритет:', Markup.inlineKeyboard(buttons, { columns: 1 }));
  } else if (ctx.session.action === 'awaiting_letter') {
    const letterText = ctx.message.text.trim();
    letters.push({
      text: letterText,
      from: ctx.from.username || ctx.from.first_name,
      at: new Date().toISOString(),
    });
    saveLetters();
    ctx.session.action = null;
    await ctx.reply('✅ Письмо сохранено!', mainMenu);
  }
});

// Запуск
bot.launch().then(() => console.log('Bot started'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

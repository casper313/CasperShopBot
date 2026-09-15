require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const LOG_CHANNEL_ID = '1547699058091761826';
const REVIEW_CHANNEL_ID = '1396875023905591356';

const COUNTER_FILE = path.join(__dirname, 'order-counter.json');
const RATINGS_FILE = path.join(__dirname, 'ratings.json');
const CUSTOMERS_FILE = path.join(__dirname, 'customers.json');
const COUPONS_FILE = path.join(__dirname, 'coupons.json');
const TICKET_PRICES_FILE = path.join(__dirname, 'ticket-prices.json');
const LOYALTY_FILE = path.join(__dirname, 'loyalty.json');
const SPIN_FILE = path.join(__dirname, 'spin-data.json');

// =========================
// JSON FUNCTIONS
// =========================

function readJson(file, fallback = {}) {
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));

      if (data && typeof data === 'object') {
        return data;
      }
    }
  } catch (error) {
    console.error(
      `Could not read ${path.basename(file)}:`,
      error
    );
  }

  return fallback;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(
      file,
      JSON.stringify(data, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error(
      `Could not save ${path.basename(file)}:`,
      error
    );
  }
}

// =========================
// ORDER ID
// =========================

function getNextOrderId() {
  let lastOrder = 0;

  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = JSON.parse(
        fs.readFileSync(COUNTER_FILE, 'utf8')
      );

      lastOrder = Number(data.lastOrder) || 0;
    }
  } catch (error) {
    console.error(
      'Could not read order counter:',
      error
    );
  }

  lastOrder += 1;

  writeJson(
    COUNTER_FILE,
    {
      lastOrder
    }
  );

  return `CS-${String(lastOrder).padStart(6, '0')}`;
}

// =========================
// DATA
// =========================

const ratings = readJson(
  RATINGS_FILE
);

const customers = readJson(
  CUSTOMERS_FILE
);

const coupons = readJson(
  COUPONS_FILE
);

const ticketPrices = readJson(
  TICKET_PRICES_FILE
);

const loyalty = readJson(
  LOYALTY_FILE
);

// =========================
// CASPER LOYALTY SYSTEM
// =========================

function getLoyalty(userId) {
  if (!loyalty[userId]) {
    loyalty[userId] = {
      xp: 0,
      orders: 0,
      totalSpent: 0,
      orderIds: [],
      joinedAt: Date.now()
    };
  }

  const data = loyalty[userId];
  data.xp = Number(data.xp || 0);
  data.orders = Number(data.orders || 0);
  data.totalSpent = Number(data.totalSpent || 0);
  data.orderIds = Array.isArray(data.orderIds) ? data.orderIds : [];
  return data;
}

function getLoyaltyLevel(xp) {
  const levels = [
    { name: 'Bronze', emoji: '🥉', min: 100 },
    { name: 'Silver', emoji: '🥈', min: 500 },
    { name: 'Gold', emoji: '🥇', min: 1500 },
    { name: 'Platinum', emoji: '💎', min: 4000 },
    { name: 'VIP', emoji: '👑', min: 10000 }
  ];

  let current = levels[0];
  for (const level of levels) {
    if (xp >= level.min) current = level;
  }

  const index = levels.findIndex(level => level.name === current.name);
  const next = levels[index + 1] || null;
  return { current, next, levels };
}

function addLoyaltyOrder(userId, orderId, amount) {
  if (!userId || !orderId) return null;

  const data = getLoyalty(userId);
  if (data.orderIds.includes(orderId)) return data;

  const spent = Math.max(0, Number(amount) || 0);
  const earnedXp = Math.floor(spent);

  data.xp += earnedXp;
  data.orders += 1;
  data.totalSpent += spent;
  data.orderIds.push(orderId);
  data.lastOrderAt = Date.now();
  data.lastOrderId = orderId;

  writeJson(LOYALTY_FILE, loyalty);
  return data;
}

function loyaltyProfileEmbed(user) {
  const data = getLoyalty(user.id);
  const level = getLoyaltyLevel(data.xp);

  let progressText = 'MAX LEVEL 👑';
  if (level.next) {
    const needed = level.next.min - data.xp;
    const span = level.next.min - level.current.min;
    const currentProgress = data.xp - level.current.min;
    const blocks = Math.min(10, Math.max(0, Math.floor((currentProgress / span) * 10)));
    progressText = `${'█'.repeat(blocks)}${'░'.repeat(10 - blocks)} ${currentProgress}/${span} XP\n` +
      `Next: ${level.next.emoji} **${level.next.name}** • ${needed} XP remaining`;
  }

  return new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle('👤 CASPER SHOP — CUSTOMER PROFILE')
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setDescription(
      `Welcome back, **${user.username}**! ❤️\n\n` +
      `${level.current.emoji} **${level.current.name} LEVEL**\n` +
      `⭐ **${data.xp.toLocaleString()} XP**\n\n` +
      `**Level Progress**\n${progressText}`
    )
    .addFields(
      { name: '🛒 Orders', value: `**${data.orders}**`, inline: true },
      { name: '💰 Total Spent', value: `$${data.totalSpent.toFixed(2)}`, inline: true },
      { name: '🏆 Status', value: `${level.current.emoji} ${level.current.name}`, inline: true }
    )
    .setFooter({ text: 'Casper Shop • Loyalty System' })
    .setTimestamp();
}

function loyaltyProfileButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('loyalty_profile')
      .setLabel('MY CASPER PROFILE')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary)
  );
}

// =========================
// CASPER DAILY SPIN
// =========================

const spinData = readJson(SPIN_FILE, {
  channelId: null,
  resultChannelId: null,
  users: {}
});
if (!Object.prototype.hasOwnProperty.call(spinData, 'resultChannelId')) spinData.resultChannelId = null;

function saveSpinData() {
  writeJson(SPIN_FILE, spinData);
}

function spinPanelEmbed() {
  return new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle('🎰 CASPER DAILY SPIN')
    .setDescription(
      '**Spin once every 24 hours!** 🍀\n\n' +
      '🎟️ **3% OFF** — Rare\n' +
      '🎟️ **5% OFF** — Extremely Rare\n' +
      '⭐ **+5 XP** — Uncommon\n' +
      '💎 **+10 XP** — Rare\n' +
      '😈 **No Reward** — Better luck next time!\n\n' +
      '**Your reward is completely random.**\n' +
      'One spin per customer every **24 hours**.'
    )
    .setFooter({ text: 'Casper Shop • Daily Spin' })
    .setTimestamp();
}

function spinButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('daily_spin')
      .setLabel('SPIN NOW')
      .setEmoji('🎰')
      .setStyle(ButtonStyle.Primary)
  );
}

function getSpinReward() {
  const roll = Math.random() * 100;

  if (roll < 1) return { type: 'coupon', discount: 5 };
  if (roll < 6) return { type: 'coupon', discount: 3 };
  if (roll < 10) return { type: 'xp', xp: 10 };
  if (roll < 20) return { type: 'xp', xp: 5 };
  return { type: 'none' };
}

function createSpinCoupon(discount, userId) {
  refreshCoupons();

  let code;
  do {
    code = `SPIN${discount}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  } while (coupons[code]);

  coupons[code] = {
    type: 'percent',
    value: Number(discount),
    maxUses: 1,
    used: 0,
    enabled: true,
    createdBy: 'DAILY_SPIN',
    createdFor: userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  };

  writeJson(COUPONS_FILE, coupons);
  return code;
}

function spinCooldown(userId) {
  const last = Number(spinData.users?.[userId]?.lastSpinAt || 0);
  const remaining = 24 * 60 * 60 * 1000 - (Date.now() - last);
  return Math.max(0, remaining);
}

function formatDuration(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}


// =========================
// LANGUAGES
// =========================

const LANGUAGES = {

  en: {

    name: 'English',
    flag: '🇬🇧',

    welcomeTitle:
      '🎫 WELCOME TO CASPER SHOP',

    welcome: () =>
      `Thank you for contacting **Casper Shop**. 👋\n\n` +
      `📦 **How can we help?**\n` +
      `Please tell us what you need and provide your order details if applicable.\n\n` +
      `💳 **Payment**\n` +
      `Please wait for a staff member before sending payment.\n\n` +
      `⚡ **Fast Delivery**\n` +
      `Once your payment is confirmed, your code will be delivered directly in this ticket.\n\n` +
      `🛡️ **Security**\n` +
      `Never share your Steam password or other sensitive information.\n\n` +
      `A staff member will assist you shortly. ❤️`,

    footer:
      'Casper Shop • Support',

    choose:
      '🌐 **Select your language**',

    chooseDescription:
      'Choose your language to continue. You can change it anytime with `/language`.',

    languageUpdated:
      '✅ **Language updated!**\nAll future messages will use your selected language.',

    onlyCustomer:
      '❌ Only the customer who opened this ticket can choose the language.',

    languageSaved:
      'Your language has been saved.',

    languageCommand:
      'Select your language:',

    deliveryTitle:
      '🎁 CODE DELIVERY — CASPER SHOP',

    server:
      'Server',

    howToUse:
      'How to use',

    instructions:
      'In-game → Store → Items → Bonus/Gift Code',

    important:
      'Important',

    importantText:
      'Enter your code, then click **DONE** when finished.',

    yourCode:
      'Your Code',

    thankYou:
      '💎 Thank you for using **Casper Shop**!',

    rateTitle:
      '⭐ **Rate your Casper Shop order**',

    ratePrompt:
      'Please choose a rating from 1 to 5 stars.',

    feedbackTitle:
      'Casper Shop Feedback',

    feedbackLabel:
      'How was your experience?',

    feedbackPlaceholder:
      'Write your feedback here...',

    reviewTitle:
      'NEW CUSTOMER REVIEW',

    reviewThanks:
      'Thank you for rating **Casper Shop**! ❤️',

    reviewOrder:
      '🧾 Order ID',

    reviewCustomer:
      '👤 Customer',

    reviewRating:
      '⭐ Rating',

    reviewFooter:
      'Casper Shop • Customer Reviews',

    submitted: rating =>
      `✅ **Thank you!** Your rating of **${rating}/5 ⭐** has been submitted.\n\n` +
      `❤️ We appreciate your feedback!`,

    alreadyRated:
      '⚠️ **You have already rated this order.**\n\n❤️ Thank you for your feedback!',

    completed:
      'COMPLETED',

    deliveryCompleted:
      '✅ DELIVERY COMPLETED'
  },

  ar: {

    name: 'العربية',
    flag: '🇱🇧',

    welcomeTitle:
      '🎫 مرحباً بك في كاسبر شوب',

    welcome: () =>
      `شكراً لتواصلك مع **Casper Shop**. 👋\n\n` +
      `📦 **كيف يمكننا مساعدتك؟**\n` +
      `أخبرنا بما تحتاجه وأرسل تفاصيل طلبك إذا كانت متوفرة.\n\n` +
      `💳 **الدفع**\n` +
      `يرجى الانتظار حتى يقوم أحد أعضاء الفريق بتأكيد الدفع قبل الإرسال.\n\n` +
      `⚡ **توصيل سريع**\n` +
      `بعد تأكيد الدفع، سيتم إرسال الكود مباشرة داخل هذه التذكرة.\n\n` +
      `🛡️ **الأمان**\n` +
      `لا تشارك كلمة مرور Steam أو أي معلومات حساسة.\n\n` +
      `سيقوم أحد أعضاء الفريق بمساعدتك قريباً. ❤️`,

    footer:
      'Casper Shop • الدعم',

    choose:
      '🌐 **اختر لغتك**',

    chooseDescription:
      'اختر اللغة للمتابعة. يمكنك تغييرها في أي وقت باستخدام `/language`.',

    languageUpdated:
      '✅ **تم تحديث اللغة!**\nستظهر جميع الرسائل القادمة باللغة التي اخترتها.',

    onlyCustomer:
      '❌ فقط العميل الذي فتح هذه التذكرة يمكنه اختيار اللغة.',

    languageSaved:
      'تم حفظ لغتك.',

    languageCommand:
      'اختر لغتك:',

    deliveryTitle:
      '🎁 تسليم الكود — CASPER SHOP',

    server:
      'السيرفر',

    howToUse:
      'طريقة الاستخدام',

    instructions:
      'داخل اللعبة → Store → Items → Bonus/Gift Code',

    important:
      'مهم',

    importantText:
      'أدخل الكود ثم اضغط **DONE** عند الانتهاء.',

    yourCode:
      'الكود الخاص بك',

    thankYou:
      '💎 شكراً لاستخدامك **Casper Shop**!',

    rateTitle:
      '⭐ **قيّم طلبك من Casper Shop**',

    ratePrompt:
      'اختر تقييماً من نجمة إلى 5 نجوم.',

    feedbackTitle:
      'ملاحظات Casper Shop',

    feedbackLabel:
      'كيف كانت تجربتك؟',

    feedbackPlaceholder:
      'اكتب ملاحظاتك هنا...',

    reviewTitle:
      'تقييم عميل جديد',

    reviewThanks:
      'شكراً لتقييمك **Casper Shop**! ❤️',

    reviewOrder:
      '🧾 رقم الطلب',

    reviewCustomer:
      '👤 العميل',

    reviewRating:
      '⭐ التقييم',

    reviewFooter:
      'Casper Shop • تقييمات العملاء',

    submitted: rating =>
      `✅ **شكراً لك!** تم إرسال تقييمك **${rating}/5 ⭐**.\n\n` +
      `❤️ نقدر ملاحظاتك!`,

    alreadyRated:
      '⚠️ **لقد قيّمت هذا الطلب مسبقاً.**\n\n❤️ شكراً على ملاحظاتك!',

    completed:
      'مكتمل',

    deliveryCompleted:
      '✅ تم إكمال التسليم'
  },

  zh: {

    name: '中文',
    flag: '🇨🇳',

    welcomeTitle:
      '🎫 欢迎来到 CASPER SHOP',

    welcome: () =>
      `感谢您联系 **Casper Shop**。👋\n\n` +
      `📦 **我们可以如何帮助您？**\n` +
      `请告诉我们您的需求，并在需要时提供订单信息。\n\n` +
      `💳 **付款**\n` +
      `付款前请等待工作人员确认。\n\n` +
      `⚡ **快速交付**\n` +
      `付款确认后，您的代码会直接发送到此工单。\n\n` +
      `🛡️ **安全**\n` +
      `请勿分享您的 Steam 密码或其他敏感信息。\n\n` +
      `工作人员会尽快帮助您。❤️`,

    footer:
      'Casper Shop • 客服支持',

    choose:
      '🌐 **请选择您的语言**',

    chooseDescription:
      '请选择语言继续。您可以随时使用 `/language` 更改语言。',

    languageUpdated:
      '✅ **语言已更新！**\n之后的消息将使用您选择的语言。',

    onlyCustomer:
      '❌ 只有创建此工单的客户可以选择语言。',

    languageSaved:
      '您的语言已保存。',

    languageCommand:
      '请选择您的语言：',

    deliveryTitle:
      '🎁 代码交付 — CASPER SHOP',

    server:
      '服务器',

    howToUse:
      '使用方法',

    instructions:
      '游戏内 → Store → Items → Bonus/Gift Code',

    important:
      '重要提示',

    importantText:
      '输入代码后，完成操作请点击 **DONE**。',

    yourCode:
      '您的代码',

    thankYou:
      '💎 感谢您使用 **Casper Shop**！',

    rateTitle:
      '⭐ **评价您的 Casper Shop 订单**',

    ratePrompt:
      '请选择 1 到 5 星评价。',

    feedbackTitle:
      'Casper Shop 反馈',

    feedbackLabel:
      '您的体验如何？',

    feedbackPlaceholder:
      '请在这里填写反馈...',

    reviewTitle:
      '新客户评价',

    reviewThanks:
      '感谢您评价 **Casper Shop**！❤️',

    reviewOrder:
      '🧾 订单号',

    reviewCustomer:
      '👤 客户',

    reviewRating:
      '⭐ 评分',

    reviewFooter:
      'Casper Shop • 客户评价',

    submitted: rating =>
      `✅ **谢谢！** 您的 **${rating}/5 ⭐** 评价已提交。\n\n` +
      `❤️ 感谢您的反馈！`,

    alreadyRated:
      '⚠️ **您已经评价过此订单。**\n\n❤️ 感谢您的反馈！',

    completed:
      '已完成',

    deliveryCompleted:
      '✅ 交付已完成'
  }
};

// =========================
// CUSTOMER LANGUAGE
// =========================

function getLanguage(userId) {

  if (
    customers[userId] &&
    LANGUAGES[customers[userId]]
  ) {
    return customers[userId];
  }

  return 'en';
}

function saveCustomerLanguage(
  userId,
  language
) {

  if (!LANGUAGES[language]) {
    language = 'en';
  }

  customers[userId] = language;

  writeJson(
    CUSTOMERS_FILE,
    customers
  );
}

// =========================
// LANGUAGE BUTTONS
// =========================

function languageButtons(userId) {

  return new ActionRowBuilder()
    .addComponents(

      new ButtonBuilder()
        .setCustomId(
          `language_select:${userId}:en`
        )
        .setLabel('English')
        .setEmoji('🇬🇧')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(
          `language_select:${userId}:ar`
        )
        .setLabel('العربية')
        .setEmoji('🇱🇧')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(
          `language_select:${userId}:zh`
        )
        .setLabel('中文')
        .setEmoji('🇨🇳')
        .setStyle(ButtonStyle.Secondary)
    );
}

// =========================
// LANGUAGE EMBED
// =========================

function languageEmbed(lang) {

  const t =
    LANGUAGES[lang];

  return new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle(t.choose)
    .setDescription(
      t.chooseDescription
    )
    .setFooter({
      text:
        'Casper Shop • Language System'
    })
    .setTimestamp();
}

// =========================
// WELCOME EMBED
// =========================

function buildWelcomeEmbed(lang) {

  const t =
    LANGUAGES[lang];

  return new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle(t.welcomeTitle)
    .setDescription(
      t.welcome()
    )
    .setFooter({
      text: t.footer
    })
    .setTimestamp();
}

// =========================
// FIND CUSTOMER
// =========================

async function findTicketCustomer(channel) {

  if (
    !channel ||
    !channel.permissionOverwrites
  ) {
    return null;
  }

  const overwrites =
    channel.permissionOverwrites.cache;

  for (
    const overwrite of overwrites.values()
  ) {

    if (overwrite.type !== 1) {
      continue;
    }

    try {

      const member =
        await channel.guild.members.fetch(
          overwrite.id
        );

      if (member.user.bot) {
        continue;
      }

      return member;

    } catch {
      continue;
    }
  }

  return null;
}

// =========================
// COUPON SYSTEM
// =========================

function normalizeCouponCode(code) {
  return String(code || '').trim().toUpperCase();
}

// Always reload coupons from disk before checking them.
// This prevents an old in-memory coupon list from causing
// "Invalid coupon code" when coupons.json was updated by
// another bot process, hosting restart, or external edit.
function refreshCoupons() {
  const latestCoupons = readJson(COUPONS_FILE, {});

  for (const key of Object.keys(coupons)) {
    delete coupons[key];
  }

  Object.assign(coupons, latestCoupons);

  return coupons;
}

function couponResult(ticketId) {
  return ticketPrices[ticketId] || null;
}

function calculateCouponPrice(basePrice, coupon) {
  if (!coupon) return Number(basePrice);

  if (coupon.type === 'fixed') {
    return Math.max(0, Number(basePrice) - Number(coupon.value));
  }

  return Math.max(
    0,
    Number(basePrice) - (Number(basePrice) * Number(coupon.value) / 100)
  );
}

function isCouponValid(code) {
  refreshCoupons();

  const normalizedCode = normalizeCouponCode(code);
  const coupon = coupons[normalizedCode];

  if (!coupon) {
    return { ok: false, reason: 'not_found' };
  }

  if (coupon.enabled === false) {
    return { ok: false, reason: 'disabled', coupon };
  }

  if (coupon.expiresAt && Date.now() >= Number(coupon.expiresAt)) {
    return { ok: false, reason: 'expired', coupon };
  }

  if (Number(coupon.maxUses) > 0 && Number(coupon.used) >= Number(coupon.maxUses)) {
    return { ok: false, reason: 'limit', coupon };
  }

  return { ok: true, coupon };
}

function couponPriceEmbed(lang, ticketId) {
  const data = ticketPrices[ticketId];
  const t = LANGUAGES[lang] || LANGUAGES.en;

  if (!data) return null;

  const base = Number(data.basePrice);
  const finalPrice = Number(data.finalPrice ?? base);
  const discount = Number(data.discountAmount || 0);

  let description =
    `**Original Price:** $${base.toFixed(2)}\n` +
    `**Final Price:** $${finalPrice.toFixed(2)}`;

  if (data.couponCode) {
    description +=
      `\n\n🎟️ **Coupon:** \`${data.couponCode}\`\n` +
      `💸 **Discount:** $${discount.toFixed(2)}`;
  }

  return new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle('💰 CASPER SHOP — PRICE')
    .setDescription(description)
    .setFooter({ text: 'Casper Shop • Coupon System' })
    .setTimestamp();
}

function couponButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('coupon_apply')
      .setLabel('APPLY COUPON')
      .setEmoji('🎟️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('coupon_remove')
      .setLabel('REMOVE COUPON')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Secondary)
  );
}

function couponErrorText(lang, reason) {
  const texts = {
    en: {
      not_found: '❌ Invalid coupon code.',
      disabled: '❌ This coupon is disabled.',
      expired: '❌ This coupon has expired.',
      limit: '❌ This coupon has reached its usage limit.'
    },
    ar: {
      not_found: '❌ كود الكوبون غير صالح.',
      disabled: '❌ هذا الكوبون متوقف.',
      expired: '❌ انتهت صلاحية هذا الكوبون.',
      limit: '❌ تم الوصول إلى الحد الأقصى لاستخدام هذا الكوبون.'
    },
    zh: {
      not_found: '❌ 优惠码无效。',
      disabled: '❌ 此优惠码已停用。',
      expired: '❌ 此优惠码已过期。',
      limit: '❌ 此优惠码已达到使用次数上限。'
    }
  };

  return texts[lang]?.[reason] || texts.en[reason] || texts.en.not_found;
}

// =========================
// DELIVERY EMBED
// =========================

function buildDeliveryEmbed(
  lang,
  code,
  orderId,
  deliveredAt
) {

  const t =
    LANGUAGES[lang];

  return new EmbedBuilder()
    .setColor('#8B0000')
    .setTitle(
      t.deliveryTitle
    )
    .setDescription(

      `**🔑 ${t.server}:** STEAM\n\n` +

      `**📌 ${t.howToUse}:**\n` +

      `${t.instructions}\n\n` +

      `**⚠️ ${t.important}:**\n` +

      `${t.importantText}\n\n` +

      `**🔐 ${t.yourCode}:**\n` +

      `\`${code}\`\n\n` +

      t.thankYou
    )

    .addFields(

      {
        name: '🧾 Order ID',
        value: `\`${orderId}\``,
        inline: true
      },

      {
        name: '🕐 Delivered At',
        value: `<t:${deliveredAt}:F>`,
        inline: true
      }
    )

    .setFooter({
      text:
        'Casper Shop • PUBG STEAM'
    })

    .setTimestamp();
}

// =========================
// CLIENT
// =========================

const client =
  new Client({

    intents: [

      GatewayIntentBits.Guilds,

      GatewayIntentBits.GuildMessages,

      GatewayIntentBits.MessageContent

    ]

  });

// Prevent a Discord API/client error from becoming an unhandled
// EventEmitter 'error' event and terminating the bot process.
client.on('error', error => {
  console.error('Discord client error (bot kept alive):', error);
});

// =========================
// COMMANDS
// =========================

const deliverCommand =
  new SlashCommandBuilder()

    .setName('deliver')

    .setDescription(
      'Deliver a PUBG Steam code'
    )

    .addStringOption(
      option =>
        option

          .setName('code')

          .setDescription(
            'Enter the Steam code'
          )

          .setRequired(true)
    );

const priceCommand =
  new SlashCommandBuilder()
    .setName('price')
    .setDescription('Set the current ticket price and show the coupon button')
    .addNumberOption(option =>
      option
        .setName('amount')
        .setDescription('Price in USD')
        .setMinValue(0)
        .setRequired(true)
    );

const couponCreateCommand =
  new SlashCommandBuilder()
    .setName('coupon-create')
    .setDescription('Create a coupon')
    .addStringOption(option =>
      option.setName('code').setDescription('Coupon code').setRequired(true)
    )
    .addNumberOption(option =>
      option.setName('discount').setDescription('Discount percentage (0-100)').setMinValue(0.01).setMaxValue(100).setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('max-uses').setDescription('Maximum uses, 0 = unlimited').setMinValue(0).setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('days').setDescription('Expires after this many days, 0 = never').setMinValue(0).setRequired(true)
    );

const couponDeleteCommand =
  new SlashCommandBuilder()
    .setName('coupon-delete')
    .setDescription('Delete a coupon')
    .addStringOption(option =>
      option.setName('code').setDescription('Coupon code').setRequired(true)
    );

const couponListCommand =
  new SlashCommandBuilder()
    .setName('coupon-list')
    .setDescription('List all coupons');

const profileCommand =
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your Casper Shop loyalty profile');

const spinSetupCommand =
  new SlashCommandBuilder()
    .setName('spin-setup')
    .setDescription('Set up the Daily Spin in the current channel');

const spinCommand =
  new SlashCommandBuilder()
    .setName('spin')
    .setDescription('Open the Daily Spin');

const spinResultSetupCommand =
  new SlashCommandBuilder()
    .setName('spin-result-setup')
    .setDescription('Set the current channel as the Daily Spin result channel');

const spinResetCommand =
  new SlashCommandBuilder()
    .setName('spin-reset')
    .setDescription('Reset a customer Daily Spin cooldown')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Customer whose Spin cooldown should be reset')
        .setRequired(true)
    );

const spinResetAllCommand =
  new SlashCommandBuilder()
    .setName('spin-reset-all')
    .setDescription('Reset all Daily Spin cooldowns');


const languageCommand =
  new SlashCommandBuilder()

    .setName('language')

    .setDescription(
      'Choose your Casper Shop language'
    );

const commands = [

  deliverCommand,

  priceCommand,

  couponCreateCommand,

  couponDeleteCommand,

  couponListCommand,

  profileCommand,

  spinSetupCommand,

  spinCommand,

  spinResultSetupCommand,

  spinResetCommand,

  spinResetAllCommand,

  languageCommand

];

// =========================
// READY
// =========================

client.once(
  'ready',
  async () => {

    console.log(
      `Logged in as ${client.user.tag}`
    );

    const rest =
      new REST({
        version: '10'
      })
        .setToken(
          process.env.DISCORD_TOKEN
        );

    for (
      const [guildId]
      of client.guilds.cache
    ) {

      try {

        await rest.put(

          Routes.applicationGuildCommands(
            client.user.id,
            guildId
          ),

          {
            body:
              commands.map(
                command =>
                  command.toJSON()
              )
          }
        );

        console.log(
          `Commands registered for server: ${guildId}`
        );

      } catch (error) {

        console.error(error);

      }
    }

    console.log(
      'Casper Shop Bot is online!'
    );
  }
);

// =========================
// AUTO TICKET WELCOME
// =========================

client.on(
  'channelCreate',
  async channel => {

    try {

      if (
        !channel.guild ||
        !channel.isTextBased()
      ) {
        return;
      }

      const channelName =
        channel.name.toLowerCase();

      if (
        !channelName.startsWith(
          'ticket-'
        )
      ) {
        return;
      }

      await new Promise(
        resolve =>
          setTimeout(resolve, 3000)
      );

      const recentMessages =
        await channel.messages.fetch({
          limit: 30
        });

      const alreadySent =
        recentMessages.some(
          msg =>

            msg.author.id ===
              client.user.id &&

            msg.embeds.some(
              embed =>

                embed.title ===
                  '🎫 WELCOME TO CASPER SHOP' ||

                embed.title ===
                  '🎫 مرحباً بك في كاسبر شوب' ||

                embed.title ===
                  '🎫 欢迎来到 CASPER SHOP' ||

                embed.title ===
                  '🌐 **Select your language**' ||

                embed.title ===
                  '🌐 **اختر لغتك**' ||

                embed.title ===
                  '🌐 **请选择您的语言**'
            )
        );

      if (alreadySent) {
        return;
      }

      const customer =
        await findTicketCustomer(
          channel
        );

      if (!customer) {

        await channel.send({

          embeds: [
            languageEmbed('en')
          ],

          components: [
            languageButtons(
              'unknown'
            )
          ]

        });

        return;
      }

      const userId =
        customer.id;

      // =========================
      // ALWAYS ASK LANGUAGE
      // =========================
      // Language is selected separately for every ticket.
      // We still save the customer's last choice for records,
      // but it is NOT automatically reused for a new ticket.

      await channel.send({

        content:
          `<@${userId}>`,

        embeds: [
          languageEmbed('en')
        ],

        components: [
          languageButtons(
            userId
          )
        ]

      });

      console.log(
        `Language selection sent | Ticket: ${channel.name} | Customer: ${customer.user.tag}`
      );

    } catch (error) {

      console.error(
        'Could not send ticket welcome:',
        error
      );

    }

  }
);

// =========================
// INTERACTIONS
// =========================

client.on(
  'interactionCreate',
  async interaction => {

    try {

      // =========================
      // SLASH COMMANDS
      // =========================

      if (
        interaction.isChatInputCommand()
      ) {

        // =========================
        // COUPON / PRICE COMMANDS
        // =========================

        if (
          ['price', 'coupon-create', 'coupon-delete', 'coupon-list'].includes(
            interaction.commandName
          )
        ) {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
              content: '❌ You do not have permission to use this command.',
              ephemeral: true
            });
          }

          if (!interaction.channel?.name?.toLowerCase().startsWith('ticket-') && interaction.commandName === 'price') {
            return interaction.reply({
              content: '❌ `/price` can only be used inside a ticket.',
              ephemeral: true
            });
          }

          if (interaction.commandName === 'price') {
            const amount = interaction.options.getNumber('amount', true);
            const ticketId = interaction.channel.id;

            ticketPrices[ticketId] = {
              basePrice: Number(amount),
              finalPrice: Number(amount),
              discountAmount: 0,
              couponCode: null,
              priceMessageId: null,
              updatedAt: Date.now()
            };

            writeJson(TICKET_PRICES_FILE, ticketPrices);

            const customer = await findTicketCustomer(interaction.channel);
            const lang = customer ? getLanguage(customer.id) : 'en';

            const priceMessage = await interaction.reply({
              content: '💰 Price set successfully.',
              embeds: [couponPriceEmbed(lang, ticketId)],
              components: [couponButtons()],
              fetchReply: true
            });

            ticketPrices[ticketId].priceMessageId = priceMessage.id;
            writeJson(TICKET_PRICES_FILE, ticketPrices);
            return;
          }

          if (interaction.commandName === 'coupon-create') {
            refreshCoupons();

            const code = normalizeCouponCode(interaction.options.getString('code', true));
            const discount = interaction.options.getNumber('discount', true);
            const maxUses = interaction.options.getInteger('max-uses', true);
            const days = interaction.options.getInteger('days', true);

            if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
              return interaction.reply({ content: '❌ Coupon code must be 2-32 characters and use only A-Z, 0-9, `_` or `-`.', ephemeral: true });
            }

            if (coupons[code]) {
              return interaction.reply({ content: '❌ This coupon already exists.', ephemeral: true });
            }

            coupons[code] = {
              type: 'percent',
              value: Number(discount),
              maxUses: Number(maxUses),
              used: 0,
              enabled: true,
              createdBy: interaction.user.id,
              createdAt: Date.now(),
              expiresAt: days > 0 ? Date.now() + days * 86400000 : null
            };

            writeJson(COUPONS_FILE, coupons);

            return interaction.reply({
              content:
                `✅ Coupon created successfully.\n\n` +
                `🎟️ Code: **${code}**\n` +
                `💸 Discount: **${discount}%**\n` +
                `🔢 Max Uses: **${maxUses === 0 ? 'Unlimited' : maxUses}**\n` +
                `⏰ Expiry: **${days === 0 ? 'Never' : `${days} day(s)`}**`,
              ephemeral: true
            });
          }

          if (interaction.commandName === 'coupon-delete') {
            refreshCoupons();

            const code = normalizeCouponCode(interaction.options.getString('code', true));

            if (!coupons[code]) {
              return interaction.reply({ content: '❌ Coupon not found.', ephemeral: true });
            }

            delete coupons[code];
            writeJson(COUPONS_FILE, coupons);

            return interaction.reply({ content: `✅ Coupon **${code}** deleted.`, ephemeral: true });
          }

          if (interaction.commandName === 'coupon-list') {
            refreshCoupons();

            const entries = Object.entries(coupons);

            if (!entries.length) {
              return interaction.reply({ content: '🎟️ No coupons created yet.', ephemeral: true });
            }

            const lines = entries.map(([code, coupon]) => {
              const expiry = coupon.expiresAt ? `<t:${Math.floor(Number(coupon.expiresAt) / 1000)}:R>` : 'Never';
              const uses = Number(coupon.maxUses) > 0 ? `${coupon.used}/${coupon.maxUses}` : `${coupon.used}/∞`;
              const status = coupon.enabled === false ? '🔴 Disabled' : '🟢 Active';
              return `**${code}** — ${coupon.value}% off — ${uses} — ${expiry} — ${status}`;
            });

            return interaction.reply({
              content: `🎟️ **Casper Shop Coupons**\n\n${lines.join('\n')}`,
              ephemeral: true
            });
          }
        }

        // =========================
        // DAILY SPIN COMMANDS
        // =========================

        if (interaction.commandName === 'spin-setup') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
              content: '❌ You do not have permission to set up the Daily Spin.',
              ephemeral: true
            });
          }

          if (!interaction.channel?.isTextBased()) {
            return interaction.reply({
              content: '❌ This command can only be used in a text channel.',
              ephemeral: true
            });
          }

          spinData.channelId = interaction.channel.id;
          saveSpinData();

          await interaction.reply({
            content: '✅ Daily Spin channel configured.',
            ephemeral: true
          });

          await interaction.channel.send({
            embeds: [spinPanelEmbed()],
            components: [spinButtonRow()]
          });

          return;
        }

        if (interaction.commandName === 'spin') {
          if (!spinData.channelId) {
            return interaction.reply({
              content: '❌ The Daily Spin has not been set up yet.',
              ephemeral: true
            });
          }

          if (interaction.channelId !== spinData.channelId) {
            return interaction.reply({
              content: `❌ Daily Spin is only available in <#${spinData.channelId}>.`,
              ephemeral: true
            });
          }

          return interaction.reply({
            embeds: [spinPanelEmbed()],
            components: [spinButtonRow()]
          });
        }

        if (interaction.commandName === 'spin-result-setup') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ You do not have permission to set up the Daily Spin result channel.', ephemeral: true });
          }
          if (!interaction.channel?.isTextBased()) {
            return interaction.reply({ content: '❌ This command can only be used in a text channel.', ephemeral: true });
          }
          spinData.resultChannelId = interaction.channel.id;
          saveSpinData();
          return interaction.reply({
            content: '✅ Daily Spin result channel configured. Coupon codes will never be posted there.',
            ephemeral: true
          });
        }

        if (interaction.commandName === 'spin-reset') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ You do not have permission to reset Daily Spin cooldowns.', ephemeral: true });
          }
          const user = interaction.options.getUser('user', true);
          if (spinData.users?.[user.id]) {
            delete spinData.users[user.id];
            saveSpinData();
          }
          return interaction.reply({ content: `✅ Daily Spin cooldown reset for ${user}.`, ephemeral: true });
        }

        if (interaction.commandName === 'spin-reset-all') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({ content: '❌ You do not have permission to reset Daily Spin cooldowns.', ephemeral: true });
          }
          spinData.users = {};
          saveSpinData();
          return interaction.reply({ content: '✅ All Daily Spin cooldowns have been reset.', ephemeral: true });
        }

        // =========================
        // /profile
        // =========================

        if (interaction.commandName === 'profile') {
          return interaction.reply({
            embeds: [loyaltyProfileEmbed(interaction.user)],
            components: [loyaltyProfileButton()]
          });
        }

        // =========================
        // /language
        // =========================

        if (
          interaction.commandName ===
          'language'
        ) {

          const lang =
            getLanguage(
              interaction.user.id
            );

          const t =
            LANGUAGES[lang];

          return interaction.reply({

            content:
              t.languageCommand,

            components: [

              languageButtons(
                interaction.user.id
              )

            ],

            ephemeral: true

          });

        }

        // =========================
        // /deliver
        // =========================

        if (
          interaction.commandName !==
          'deliver'
        ) {
          return;
        }

        if (
          !interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageMessages
          )
        ) {

          return interaction.reply({

            content:
              'You do not have permission to use this command.',

            ephemeral: true

          });

        }

        const code =
          interaction.options.getString(
            'code',
            true
          );

        const customer =
          await findTicketCustomer(
            interaction.channel
          );

        const customerText =
          customer
            ? `<@${customer.id}>`
            : 'Customer not detected';

        const customerLanguage =
          customer
            ? getLanguage(customer.id)
            : 'en';

        const orderId =
          getNextOrderId();

        const deliveredAt =
          Math.floor(
            Date.now() / 1000
          );

        const embed =
          buildDeliveryEmbed(

            customerLanguage,

            code,

            orderId,

            deliveredAt

          );

        const temporaryButton =
          new ButtonBuilder()

            .setCustomId(
              'delivery_loading'
            )

            .setLabel(
              'DONE'
            )

            .setEmoji(
              '✅'
            )

            .setStyle(
              ButtonStyle.Success
            )

            .setDisabled(true);

        await interaction.reply({

          embeds: [
            embed
          ],

          components: [

            new ActionRowBuilder()
              .addComponents(
                temporaryButton
              )

          ]

        });

        try {

          const logChannel =
            await client.channels.fetch(
              LOG_CHANNEL_ID
            );

          if (
            !logChannel ||
            !logChannel.isTextBased()
          ) {

            throw new Error(
              'Delivery log channel not found.'
            );

          }

          const logEmbed =
            new EmbedBuilder()

              .setColor(
                '#8B0000'
              )

              .setTitle(
                '📦 NEW CODE DELIVERY'
              )

              .addFields(

                {
                  name:
                    '🧾 Order ID',

                  value:
                    `\`${orderId}\``,

                  inline:
                    true
                },

                {
                  name:
                    '👤 Customer',

                  value:
                    customerText,

                  inline:
                    true
                },

                {
                  name:
                    '🛡️ Staff',

                  value:
                    `<@${interaction.user.id}>`,

                  inline:
                    true
                },

                {
                  name:
                    '🔐 Code',

                  value:
                    `\`${code}\``,

                  inline:
                    false
                },

                {
                  name:
                    '🌐 Language',

                  value:
                    `${LANGUAGES[customerLanguage].flag} ${LANGUAGES[customerLanguage].name}`,

                  inline:
                    true
                },

                {
                  name:
                    '📍 Ticket',

                  value:
                    `<#${interaction.channel.id}>`,

                  inline:
                    true
                },

                {
                  name:
                    '🕐 Delivered At',

                  value:
                    `<t:${deliveredAt}:F>`,

                  inline:
                    true
                },

                {
                  name:
                    '📊 Status',

                  value:
                    '🟡 Pending',

                  inline:
                    true
                }

              )

              .setFooter({

                text:
                  'Casper Shop • Delivery Logs'

              })

              .setTimestamp();

          const logMessage =
            await logChannel.send({

              embeds: [
                logEmbed
              ]

            });

          const copyButton =
            new ButtonBuilder()

              .setCustomId(
                `copy_code:${logMessage.id}`
              )

              .setLabel(
                'COPY CODE'
              )

              .setEmoji(
                '📋'
              )

              .setStyle(
                ButtonStyle.Primary
              );

          const doneButton =
            new ButtonBuilder()

              .setCustomId(
                `delivery_done:${logMessage.id}`
              )

              .setLabel(
                'DONE'
              )

              .setEmoji(
                '✅'
              )

              .setStyle(
                ButtonStyle.Success
              );

          const rateButton =
            new ButtonBuilder()

              .setCustomId(
                `rate_order:${orderId}`
              )

              .setLabel(
                'RATE US'
              )

              .setEmoji(
                '⭐'
              )

              .setStyle(
                ButtonStyle.Primary
              );

          await interaction.editReply({

            components: [

              new ActionRowBuilder()
                .addComponents(

                  copyButton,

                  doneButton,

                  rateButton

                )

            ]

          });

          console.log(

            `Delivery created | Order: ${orderId} | Customer: ${customer?.user.tag || 'Unknown'} | Language: ${customerLanguage} | Staff: ${interaction.user.tag}`

          );

        } catch (error) {

          console.error(
            'Could not create delivery log:',
            error
          );

        }

        return;
      }

      // =========================
      // BUTTONS
      // =========================

      if (
        interaction.isButton()
      ) {
        // Acknowledge component interactions immediately. Discord requires the
        // initial response within ~3 seconds. Modal-opening buttons are the
        // exception because showModal() must be the initial response.
        const opensModal =
          interaction.customId === 'coupon_apply' ||
          interaction.customId.startsWith('select_rating:');

        if (!opensModal) {
          try {
            await interaction.deferUpdate();
          } catch (error) {
            console.error('Could not acknowledge button interaction:', error);
            return;
          }
        }

        // =========================
        // DAILY SPIN
        // =========================

        if (interaction.customId === 'daily_spin') {
          if (!spinData.channelId || interaction.channelId !== spinData.channelId) {
            return interaction.followUp({
              content: spinData.channelId
                ? `❌ Daily Spin is only available in <#${spinData.channelId}>.`
                : '❌ The Daily Spin has not been set up yet.',
              ephemeral: true
            });
          }

          const remaining = spinCooldown(interaction.user.id);
          if (remaining > 0) {
            return interaction.followUp({
              content: `⏰ **You already used your Daily Spin!**\n\nCome back in **${formatDuration(remaining)}**.`,
              ephemeral: true
            });
          }

          // Lock the spin before calculating the reward so a user
          // cannot double-click and receive two rewards.
          if (!spinData.users) spinData.users = {};
          spinData.users[interaction.user.id] = {
            lastSpinAt: Date.now()
          };
          saveSpinData();

          const reward = getSpinReward();
          let result;
          let resultPublic;

          if (reward.type === 'coupon') {
            const code = createSpinCoupon(reward.discount, interaction.user.id);
            result =
              `🎉 **CONGRATULATIONS!**\n\n` +
              `🎟️ You won a **${reward.discount}% OFF coupon!**\n\n` +
              `🔐 Your coupon code will be given to you manually in a ticket.\n` +
              `⏰ Valid for **24 hours**\n` +
              `🔢 **1 use only**`;
            resultPublic =
              `🎉 **DAILY SPIN RESULT**\n\n` +
              `👤 Customer: ${interaction.user}\n` +
              `🎟️ Reward: **${reward.discount}% OFF Coupon**\n\n` +
              `📩 Please open a ticket to claim your reward.\n` +
              `🔒 Coupon code hidden`;
          } else if (reward.type === 'xp') {
            const data = getLoyalty(interaction.user.id);
            const oldLevel = getLoyaltyLevel(data.xp).current.name;

            data.xp += reward.xp;
            data.lastSpinXpAt = Date.now();
            writeJson(LOYALTY_FILE, loyalty);

            const newLevel = getLoyaltyLevel(data.xp).current.name;

            result =
              `🎉 **CONGRATULATIONS!**\n\n` +
              `⭐ You won **+${reward.xp} XP**!\n\n` +
              `🏆 Current XP: **${data.xp.toLocaleString()} XP**` +
              (oldLevel !== newLevel
                ? `\n\n🚀 **LEVEL UP!** You reached **${getLoyaltyLevel(data.xp).current.emoji} ${newLevel}**!`
                : '');
            resultPublic =
              `🎉 **DAILY SPIN RESULT**\n\n` +
              `👤 Customer: ${interaction.user}\n` +
              `⭐ Reward: **+${reward.xp} XP**\n` +
              `🏆 Current XP: **${data.xp.toLocaleString()} XP**`;
          } else {
            result =
              `😈 **No reward this time!**\n\n` +
              `Better luck on your next spin. 🍀`;
            resultPublic =
              `🎰 **DAILY SPIN RESULT**\n\n` +
              `👤 Customer: ${interaction.user}\n` +
              `😈 Reward: **No Reward**\n\n` +
              `🍀 Better luck next time!`;
          }

          if (spinData.resultChannelId) {
            try {
              const resultChannel = await interaction.client.channels.fetch(spinData.resultChannelId);
              if (resultChannel?.isTextBased()) {
                await resultChannel.send({ content: resultPublic });
              }
            } catch (err) {
              console.error('Failed to send Daily Spin result:', err);
            }
          }

          return interaction.followUp({
            content: result,
            ephemeral: true
          });
        }

        // =========================
        // LANGUAGE SELECT
        // =========================

        if (
          interaction.customId.startsWith(
            'language_select:'
          )
        ) {

          const parts =
            interaction.customId.split(
              ':'
            );

          const targetUserId =
            parts[1];

          const selectedLanguage =
            parts[2];

          if (
            targetUserId !==
            interaction.user.id
          ) {

            return interaction.followUp({

              content:
                '❌ Only the customer who opened this ticket can choose the language.',

              ephemeral:
                true

            });

          }

          if (
            !LANGUAGES[
              selectedLanguage
            ]
          ) {

            return interaction.followUp({

              content:
                '❌ Invalid language.',

              ephemeral:
                true

            });

          }

          saveCustomerLanguage(

            interaction.user.id,

            selectedLanguage

          );

          const t =
            LANGUAGES[
              selectedLanguage
            ];

          // =========================
          // TICKET LANGUAGE
          // =========================

          if (
            interaction.message
              .channel
              ?.name
              ?.toLowerCase()
              .startsWith(
                'ticket-'
              )
          ) {

            const welcomeEmbed =
              buildWelcomeEmbed(
                selectedLanguage
              );

            await interaction.editReply({

              content:
                `<@${interaction.user.id}>`,

              embeds: [
                welcomeEmbed
              ],

              components: [
                couponButtons(),
                loyaltyProfileButton()
              ]

            });

          }

          // =========================
          // /language
          // =========================

          else {

            await interaction.editReply({

              content:

                `${t.languageUpdated}\n\n` +

                `${t.languageSaved}`,

              components: [

                languageButtons(
                  interaction.user.id
                )

              ]

            });

          }

          console.log(

            `Language selected | Customer: ${interaction.user.tag} | Language: ${selectedLanguage}`

          );

          return;
        }

        // =========================
        // MY CASPER PROFILE
        // =========================

        if (interaction.customId === 'loyalty_profile') {
          const customer = await findTicketCustomer(interaction.channel);
          if (customer && customer.id !== interaction.user.id) {
            return interaction.followUp({
              content: '❌ Only the customer who opened this ticket can view this profile button.',
              ephemeral: true
            });
          }

          return interaction.followUp({
            embeds: [loyaltyProfileEmbed(interaction.user)],
            ephemeral: true
          });
        }

        // =========================
        // COPY CODE
        // =========================

        if (
          interaction.customId.startsWith(
            'copy_code:'
          )
        ) {

          const embed =
            interaction.message
              .embeds[0];

          const description =
            embed?.description ||
            '';

          const match =
            description.match(

              /\*\*[^\\n]*Your Code[^\\n]*:\*\*\s*\n`([^`]+)`|\*\*[^\\n]*الكود الخاص بك[^\\n]*:\*\*\s*\n`([^`]+)`|\*\*[^\\n]*您的代码[^\\n]*:\*\*\s*\n`([^`]+)`/i

            );

          const code =
            match?.[1] ||
            match?.[2] ||
            match?.[3];

          if (!code) {

            return interaction.followUp({

              content:
                '❌ Could not find the code in this delivery message.',

              ephemeral:
                true

            });

          }

          await interaction.followUp({

            content:

              `📋 **Your Code:**\n` +

              `\`${code}\`\n\n` +

              `You can copy it from the message above.`,

            ephemeral:
              true

          });

          return;
        }

        // =========================
        // APPLY COUPON
        // =========================

        if (interaction.customId === 'coupon_apply') {
          const ticketId = interaction.channel.id;
          const data = ticketPrices[ticketId];

          if (!data) {
            return interaction.reply({ content: '❌ No ticket price has been set yet.', ephemeral: true });
          }

          if (data.couponCode) {
            return interaction.reply({ content: `❌ A coupon (\`${data.couponCode}\`) is already applied to this ticket. Remove it first.`, ephemeral: true });
          }

          const modal = new ModalBuilder()
            .setCustomId(`coupon_modal:${ticketId}`)
            .setTitle('🎟️ Apply Coupon');

          const input = new TextInputBuilder()
            .setCustomId('coupon_code')
            .setLabel('Coupon Code')
            .setPlaceholder('Example: CASPER10')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(32);

          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
        }

        // =========================
        // REMOVE COUPON
        // =========================

        if (interaction.customId === 'coupon_remove') {
          const ticketId = interaction.channel.id;
          const data = ticketPrices[ticketId];

          if (!data) {
            return interaction.followUp({ content: '❌ No ticket price has been set yet.', ephemeral: true });
          }

          const customer = await findTicketCustomer(interaction.channel);
          if (!customer || customer.id !== interaction.user.id) {
            return interaction.followUp({ content: '❌ Only the customer who opened this ticket can remove the coupon.', ephemeral: true });
          }

          // If a coupon was applied, return its usage when the customer removes it.
          const removedCouponCode = normalizeCouponCode(data.couponCode);
          if (removedCouponCode && coupons[removedCouponCode]) {
            coupons[removedCouponCode].used = Math.max(
              0,
              Number(coupons[removedCouponCode].used || 0) - 1
            );
            coupons[removedCouponCode].lastUsedAt = null;
            coupons[removedCouponCode].lastUsedBy = null;
            coupons[removedCouponCode].lastUsedTicket = null;
            writeJson(COUPONS_FILE, coupons);
          }

          data.finalPrice = Number(data.basePrice);
          data.discountAmount = 0;
          data.couponCode = null;
          data.couponAppliedBy = null;
          data.updatedAt = Date.now();
          writeJson(TICKET_PRICES_FILE, ticketPrices);

          const lang = getLanguage(interaction.user.id);
          return interaction.editReply({
            content: '🗑️ Coupon removed.',
            embeds: [couponPriceEmbed(lang, ticketId)],
            components: [couponButtons()]
          });
        }

        // =========================
        // RATE US
        // =========================

        if (
          interaction.customId.startsWith(
            'rate_order:'
          )
        ) {

          const orderId =
            interaction.customId.substring(
              'rate_order:'.length
            );

          const ratingKey =
            `${orderId}:${interaction.user.id}`;

          const lang =
            getLanguage(
              interaction.user.id
            );

          const t =
            LANGUAGES[lang];

          if (
            ratings[ratingKey]
          ) {

            return interaction.followUp({

              content:
                t.alreadyRated,

              ephemeral:
                true

            });

          }

          const ratingButtons =
            [1, 2, 3, 4, 5].map(

              rating =>

                new ButtonBuilder()

                  .setCustomId(
                    `select_rating:${orderId}:${rating}`
                  )

                  .setLabel(
                    `${rating}/5`
                  )

                  .setEmoji(
                    '⭐'
                  )

                  .setStyle(

                    rating >= 4

                      ? ButtonStyle.Success

                      : rating >= 3

                        ? ButtonStyle.Primary

                        : ButtonStyle.Secondary

                  )

            );

          await interaction.followUp({

            content:

              `${t.rateTitle}\n` +

              `Order: \`${orderId}\`\n\n` +

              t.ratePrompt,

            components: [

              new ActionRowBuilder()
                .addComponents(
                  ratingButtons
                )

            ],

            ephemeral:
              true

          });

          return;
        }

        // =========================
        // SELECT RATING
        // =========================

        if (
          interaction.customId.startsWith(
            'select_rating:'
          )
        ) {

          const parts =
            interaction.customId.split(
              ':'
            );

          const orderId =
            parts[1];

          const rating =
            Number(parts[2]);

          const lang =
            getLanguage(
              interaction.user.id
            );

          const t =
            LANGUAGES[lang];

          if (

            !orderId ||

            !Number.isInteger(
              rating
            ) ||

            rating < 1 ||

            rating > 5

          ) {

            return interaction.reply({

              content:
                '❌ Invalid rating.',

              ephemeral:
                true

            });

          }

          const ratingKey =
            `${orderId}:${interaction.user.id}`;

          if (
            ratings[ratingKey]
          ) {

            return interaction.reply({

              content:
                t.alreadyRated,

              components: []

            });

          }

          const modal =
            new ModalBuilder()

              .setCustomId(
                `feedback_modal:${orderId}:${rating}`
              )

              .setTitle(
                t.feedbackTitle
              );

          const feedbackInput =
            new TextInputBuilder()

              .setCustomId(
                'feedback'
              )

              .setLabel(
                t.feedbackLabel
              )

              .setPlaceholder(
                t.feedbackPlaceholder
              )

              .setStyle(
                TextInputStyle.Paragraph
              )

              .setRequired(
                false
              )

              .setMaxLength(
                1000
              );

          modal.addComponents(

            new ActionRowBuilder()
              .addComponents(
                feedbackInput
              )

          );

          await interaction.showModal(
            modal
          );

          return;
        }

        // =========================
        // DONE
        // =========================

        if (
          interaction.customId.startsWith(
            'delivery_done:'
          )
        ) {

          const logMessageId =
            interaction.customId.substring(
              'delivery_done:'.length
            );

          const oldEmbed =
            interaction.message
              .embeds[0];

          if (!oldEmbed) {

            return interaction.followUp({

              content:
                '❌ Delivery message could not be read.',

              ephemeral:
                true

            });

          }

          const orderField =
            oldEmbed.fields?.find(

              field =>
                field.name ===
                '🧾 Order ID'

            );

          const orderIdMatch =
            orderField
              ?.value
              ?.match(
                /`([^`]+)`/
              );

          const orderId =
            orderIdMatch
              ? orderIdMatch[1]
              : 'unknown';

          const customer =
            await findTicketCustomer(
              interaction.channel
            );

          const lang =
            customer
              ? getLanguage(
                  customer.id
                )
              : 'en';

          const t =
            LANGUAGES[lang];

          // =========================
          // LOYALTY REWARD
          // =========================
          // Count the order only once when DONE is clicked.
          if (customer) {
            const ticketData = ticketPrices[interaction.channel.id];
            const finalAmount = ticketData ? Number(ticketData.finalPrice ?? ticketData.basePrice ?? 0) : 0;
            addLoyaltyOrder(customer.id, orderId, finalAmount);
          }

          const completedEmbed =
            new EmbedBuilder(
              oldEmbed.toJSON()
            )

              .setColor(
                '#2E7D32'
              )

              .setTitle(
                t.deliveryCompleted
              )

              .setFooter({

                text:
                  `Casper Shop • Completed by ${interaction.user.username}`

              })

              .setTimestamp();

          const copyButton =
            new ButtonBuilder()

              .setCustomId(
                `copy_code:${logMessageId}`
              )

              .setLabel(
                'COPY CODE'
              )

              .setEmoji(
                '📋'
              )

              .setStyle(
                ButtonStyle.Primary
              );

          const completedButton =
            new ButtonBuilder()

              .setCustomId(
                'delivery_completed'
              )

              .setLabel(
                t.completed
              )

              .setEmoji(
                '✅'
              )

              .setStyle(
                ButtonStyle.Secondary
              )

              .setDisabled(
                true
              );

          const rateButton =
            new ButtonBuilder()

              .setCustomId(
                `rate_order:${orderId}`
              )

              .setLabel(
                'RATE US'
              )

              .setEmoji(
                '⭐'
              )

              .setStyle(
                ButtonStyle.Primary
              );

          await interaction.editReply({

            embeds: [
              completedEmbed
            ],

            components: [

              new ActionRowBuilder()
                .addComponents(

                  copyButton,

                  completedButton,

                  rateButton

                )

            ]

          });

          // =========================
          // UPDATE LOG
          // =========================

          try {

            const logChannel =
              await client.channels.fetch(
                LOG_CHANNEL_ID
              );

            const logMessage =
              await logChannel.messages.fetch(
                logMessageId
              );

            const oldLogEmbed =
              logMessage.embeds[0];

            if (!oldLogEmbed) {
              return;
            }

            const fields =
              oldLogEmbed.fields

                .filter(

                  field =>

                    ![
                      '📊 Status',
                      '✅ Completed By',
                      '🕐 Completed At'
                    ].includes(
                      field.name
                    )

                )

                .map(
                  field => ({

                    name:
                      field.name,

                    value:
                      field.value,

                    inline:
                      field.inline

                  })
                );

            const completedAt =
              Math.floor(
                Date.now() / 1000
              );

            const completedLogEmbed =
              new EmbedBuilder()

                .setColor(
                  '#2E7D32'
                )

                .setTitle(
                  '✅ DELIVERY COMPLETED'
                )

                .addFields(

                  ...fields,

                  {

                    name:
                      '📊 Status',

                    value:
                      '🟢 Completed',

                    inline:
                      true

                  },

                  {

                    name:
                      '✅ Completed By',

                    value:
                      `<@${interaction.user.id}>`,

                    inline:
                      true

                  },

                  {

                    name:
                      '🕐 Completed At',

                    value:
                      `<t:${completedAt}:F>`,

                    inline:
                      true

                  }

                )

                .setFooter({

                  text:
                    'Casper Shop • Delivery Logs'

                })

                .setTimestamp();

            await logMessage.edit({

              embeds: [
                completedLogEmbed
              ]

            });

            console.log(

              `Delivery completed | Order: ${orderId} | Completed by: ${interaction.user.tag}`

            );

          } catch (error) {

            console.error(

              'Could not update delivery log:',

              error

            );

          }

          return;
        }
      }

      // =========================
      // COUPON MODAL
      // =========================

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith('coupon_modal:')
      ) {
        const ticketId = interaction.customId.substring('coupon_modal:'.length);
        const data = ticketPrices[ticketId];

        if (!data || interaction.channel.id !== ticketId) {
          return interaction.reply({ content: '❌ This coupon request is no longer valid.', ephemeral: true });
        }

        if (data.couponCode) {
          return interaction.reply({ content: `❌ A coupon (\`${data.couponCode}\`) is already applied to this ticket.`, ephemeral: true });
        }

        const customer = await findTicketCustomer(interaction.channel);
        if (!customer || customer.id !== interaction.user.id) {
          return interaction.reply({ content: '❌ Only the customer who opened this ticket can apply a coupon.', ephemeral: true });
        }

        const code = normalizeCouponCode(
          interaction.fields.getTextInputValue('coupon_code')
        );

        // Reload coupons.json so the newest coupon is always checked.
        refreshCoupons();

        const validation = isCouponValid(code);
        const lang = getLanguage(interaction.user.id);

        if (!validation.ok) {
          return interaction.reply({
            content: couponErrorText(lang, validation.reason),
            ephemeral: true
          });
        }

        const coupon = validation.coupon;
        const basePrice = Number(data.basePrice);
        const finalPrice = calculateCouponPrice(basePrice, coupon);
        const discountAmount = basePrice - finalPrice;

        data.finalPrice = finalPrice;
        data.discountAmount = discountAmount;
        data.couponCode = code;
        data.couponAppliedBy = interaction.user.id;
        data.updatedAt = Date.now();

        coupon.used = Number(coupon.used || 0) + 1;
        coupon.lastUsedAt = Date.now();
        coupon.lastUsedBy = interaction.user.id;
        coupon.lastUsedTicket = ticketId;

        writeJson(TICKET_PRICES_FILE, ticketPrices);
        writeJson(COUPONS_FILE, coupons);

        if (data.priceMessageId) {
          try {
            const priceMessage = await interaction.channel.messages.fetch(data.priceMessageId);
            await priceMessage.edit({
              content: '💰 Price updated with coupon.',
              embeds: [couponPriceEmbed(lang, ticketId)],
              components: [couponButtons()]
            });
          } catch (error) {
            console.error('Could not update coupon price message:', error);
          }
        }

        await interaction.reply({
          content:
            `✅ **Coupon applied!**\n` +
            `🎟️ Code: **${code}**\n` +
            `💸 Discount: **${coupon.value}%**\n` +
            `💰 Final Price: **$${finalPrice.toFixed(2)}**`,
          ephemeral: true
        });

        return;
      }

      // =========================
      // FEEDBACK MODAL
      // =========================

      if (
        interaction.isModalSubmit()
      ) {

        if (
          !interaction.customId.startsWith(
            'feedback_modal:'
          )
        ) {
          return;
        }

        const parts =
          interaction.customId.split(
            ':'
          );

        const orderId =
          parts[1];

        const rating =
          Number(parts[2]);

        const lang =
          getLanguage(
            interaction.user.id
          );

        const t =
          LANGUAGES[lang];

        if (

          !orderId ||

          !Number.isInteger(
            rating
          ) ||

          rating < 1 ||

          rating > 5

        ) {

          return interaction.reply({

            content:
              '❌ Invalid rating submission.',

            ephemeral:
              true

          });

        }

        const ratingKey =
          `${orderId}:${interaction.user.id}`;

        if (
          ratings[ratingKey]
        ) {

          return interaction.reply({

            content:
              t.alreadyRated,

            ephemeral:
              true

          });

        }

        let feedback = '';

        try {

          feedback =
            interaction.fields
              .getTextInputValue(
                'feedback'
              )
              .trim();

        } catch {

          feedback = '';

        }

        if (!feedback) {

          feedback =
            'No written feedback provided.';

        }

        const reviewChannel =
          await client.channels.fetch(
            REVIEW_CHANNEL_ID
          );

        if (

          !reviewChannel ||

          !reviewChannel.isTextBased()

        ) {

          return interaction.reply({

            content:
              '❌ Review channel could not be found.',

            ephemeral:
              true

          });

        }

        const stars =
          '⭐'.repeat(
            rating
          ) +

          '☆'.repeat(
            5 - rating
          );

        const reviewEmbed =
          new EmbedBuilder()

            .setColor(
              '#FFD700'
            )

            .setTitle(
              t.reviewTitle
            )

            .setDescription(

              `**${stars}**\n\n` +

              `> ${feedback}\n\n` +

              t.reviewThanks

            )

            .addFields(

              {

                name:
                  t.reviewOrder,

                value:
                  `\`${orderId}\``,

                inline:
                  true

              },

              {

                name:
                  t.reviewCustomer,

                value:
                  `<@${interaction.user.id}>`,

                inline:
                  true

              },

              {

                name:
                  t.reviewRating,

                value:
                  `**${rating}/5**`,

                inline:
                  true

              }

            )

            .setFooter({

              text:
                t.reviewFooter

            })

            .setTimestamp();

        try {

          await reviewChannel.send({

            embeds: [
              reviewEmbed
            ]

          });

        } catch (error) {

          console.error(
            'Could not send review:',
            error
          );

          return interaction.reply({

            content:
              '❌ Could not submit your review. Please try again.',

            ephemeral:
              true

          });

        }

        ratings[ratingKey] = {

          orderId,

          userId:
            interaction.user.id,

          rating,

          feedback,

          language:
            lang,

          submittedAt:
            new Date().toISOString()

        };

        writeJson(
          RATINGS_FILE,
          ratings
        );

        await interaction.reply({

          content:
            t.submitted(
              rating
            ),

          ephemeral:
            true

        });

        console.log(

          `Review submitted | Order: ${orderId} | Rating: ${rating}/5 | Customer: ${interaction.user.tag}`

        );

        return;
      }

    } catch (error) {

      console.error(
        'Interaction error:',
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        try {

          await interaction.reply({

            content:
              '❌ Something went wrong. Please try again.',

            ephemeral:
              true

          });

        } catch {}

      }

    }

  }
);

// =========================
// DISCORD TOKEN
// =========================

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection (bot kept alive):', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception (bot kept alive):', error);
});

const DISCORD_TOKEN =
  process.env.DISCORD_TOKEN
    ?.trim()
    .replace(
      /^[\"']|[\"']$/g,
      ''
    );

if (!DISCORD_TOKEN) {

  console.error(
    'DISCORD_TOKEN is missing.'
  );

  process.exit(1);
}

client.login(
  DISCORD_TOKEN
);

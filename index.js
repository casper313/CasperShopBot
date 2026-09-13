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

const languageCommand =
  new SlashCommandBuilder()

    .setName('language')

    .setDescription(
      'Choose your Casper Shop language'
    );

const commands = [

  deliverCommand,

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

      const savedLanguage =
        customers[userId];

      // =========================
      // NEW CUSTOMER
      // =========================

      if (
        !LANGUAGES[savedLanguage]
      ) {

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

        return;
      }

      // =========================
      // RETURNING CUSTOMER
      // =========================

      await channel.send({

        content:
          `<@${userId}>`,

        embeds: [
          buildWelcomeEmbed(
            savedLanguage
          )
        ]

      });

      console.log(

        `Ticket welcome sent | Ticket: ${channel.name} | Customer: ${customer.user.tag} | Language: ${savedLanguage}`

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

            return interaction.reply({

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

            return interaction.reply({

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

            await interaction.update({

              content:
                `<@${interaction.user.id}>`,

              embeds: [
                welcomeEmbed
              ],

              components: []

            });

          }

          // =========================
          // /language
          // =========================

          else {

            await interaction.update({

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

            return interaction.reply({

              content:
                '❌ Could not find the code in this delivery message.',

              ephemeral:
                true

            });

          }

          await interaction.reply({

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

            return interaction.reply({

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

          await interaction.reply({

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

            return interaction.update({

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

            return interaction.reply({

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

          await interaction.update({

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

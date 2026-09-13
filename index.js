```js
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

// =========================
// FILES
// =========================

const COUNTER_FILE = path.join(__dirname, 'order-counter.json');
const RATINGS_FILE = path.join(__dirname, 'ratings.json');

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

  try {
    fs.writeFileSync(
      COUNTER_FILE,
      JSON.stringify(
        { lastOrder },
        null,
        2
      ),
      'utf8'
    );
  } catch (error) {
    console.error(
      'Could not save order counter:',
      error
    );
  }

  return `CS-${String(lastOrder).padStart(6, '0')}`;
}

// =========================
// RATINGS STORAGE
// =========================

function loadRatings() {
  try {
    if (fs.existsSync(RATINGS_FILE)) {
      return JSON.parse(
        fs.readFileSync(
          RATINGS_FILE,
          'utf8'
        )
      );
    }
  } catch (error) {
    console.error(
      'Could not read ratings:',
      error
    );
  }

  return {};
}

function saveRatings(ratings) {
  try {
    fs.writeFileSync(
      RATINGS_FILE,
      JSON.stringify(
        ratings,
        null,
        2
      ),
      'utf8'
    );
  } catch (error) {
    console.error(
      'Could not save ratings:',
      error
    );
  }
}

const ratings = loadRatings();

// =========================
// CLIENT
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =========================
// /deliver COMMAND
// =========================

const command = new SlashCommandBuilder()
  .setName('deliver')
  .setDescription(
    'Deliver a PUBG Steam code'
  )
  .addStringOption(option =>
    option
      .setName('code')
      .setDescription(
        'Enter the Steam code'
      )
      .setRequired(true)
  );

// =========================
// FIND TICKET CUSTOMER
// =========================

async function findTicketCustomer(channel) {
  const overwrites =
    channel.permissionOverwrites.cache;

  for (
    const overwrite of overwrites.values()
  ) {
    if (overwrite.type !== 1) continue;

    try {
      const member =
        await channel.guild.members.fetch(
          overwrite.id
        );

      if (member.user.bot) continue;

      return member;
    } catch {
      continue;
    }
  }

  return null;
}

// =========================
// BOT READY
// =========================

client.once('ready', async () => {
  console.log(
    `Logged in as ${client.user.tag}`
  );

  const rest = new REST({
    version: '10'
  }).setToken(
    process.env.DISCORD_TOKEN
  );

  for (
    const [guildId] of client.guilds.cache
  ) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(
          client.user.id,
          guildId
        ),
        {
          body: [command.toJSON()]
        }
      );

      console.log(
        `Command registered for server: ${guildId}`
      );
    } catch (error) {
      console.error(error);
    }
  }

  console.log(
    'Casper Shop Bot is online!'
  );
});

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
        !channelName.startsWith('ticket-')
      ) {
        return;
      }

      await new Promise(resolve =>
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
                '🎫 WELCOME TO CASPER SHOP'
            )
        );

      if (alreadySent) return;

      const customer =
        await findTicketCustomer(channel);

      const mention = customer
        ? `<@${customer.id}>`
        : '';

      const welcomeEmbed =
        new EmbedBuilder()
          .setColor('#8B0000')
          .setTitle(
            '🎫 WELCOME TO CASPER SHOP'
          )
          .setDescription(
            'Thank you for contacting **Casper Shop**. 👋\n\n' +
            '📦 **How can we help?**\n' +
            'Please tell us what you need and provide your order details if applicable.\n\n' +
            '💳 **Payment**\n' +
            'Please wait for a staff member before sending payment.\n\n' +
            '⚡ **Fast Delivery**\n' +
            'Once your payment is confirmed, your code will be delivered directly in this ticket.\n\n' +
            '🛡️ **Security**\n' +
            'Never share your Steam password or other sensitive information.\n\n' +
            'A staff member will assist you shortly. ❤️'
          )
          .setFooter({
            text:
              'Casper Shop • Support'
          })
          .setTimestamp();

      await channel.send({
        ...(mention
          ? { content: mention }
          : {}),
        embeds: [welcomeEmbed]
      });

      console.log(
        `Ticket welcome sent | Ticket: ${channel.name} | Customer: ${
          customer?.user.tag ||
          'Not detected'
        }`
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

    // =========================
    // /deliver
    // =========================

    if (interaction.isChatInputCommand()) {

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

      const customerText = customer
        ? `<@${customer.id}>`
        : 'Customer not detected';

      const orderId =
        getNextOrderId();

      const deliveredAt =
        Math.floor(
          Date.now() / 1000
        );

      // =========================
      // DELIVERY EMBED
      // =========================

      const embed =
        new EmbedBuilder()
          .setColor('#8B0000')
          .setTitle(
            '🎁 CODE DELIVERY — CASPER SHOP'
          )
          .setDescription(
            '**🔑 Server:** STEAM\n\n' +
            '**📌 How to use:**\n' +
            'In-game → Store → Items → Bonus/Gift Code\n\n' +
            '**⚠️ Important:**\n' +
            'Enter your code, then click **DONE** when finished.\n\n' +
            '**🔐 Your Code:**\n' +
            `\`${code}\`\n\n` +
            '💎 Thank you for using **Casper Shop**!'
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

      // =========================
      // TEMPORARY BUTTON
      // =========================

      const temporaryButton =
        new ButtonBuilder()
          .setCustomId(
            'delivery_loading'
          )
          .setLabel('DONE')
          .setEmoji('✅')
          .setStyle(
            ButtonStyle.Success
          )
          .setDisabled(true);

      const temporaryRow =
        new ActionRowBuilder()
          .addComponents(
            temporaryButton
          );

      await interaction.reply({
        embeds: [embed],
        components: [temporaryRow]
      });

      try {

        // =========================
        // DELIVERY LOG
        // =========================

        const logChannel =
          await client.channels.fetch(
            LOG_CHANNEL_ID
          );

        if (!logChannel) {
          throw new Error(
            'Delivery log channel not found.'
          );
        }

        const logEmbed =
          new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle(
              '📦 NEW CODE DELIVERY'
            )
            .addFields(
              {
                name: '🧾 Order ID',
                value: `\`${orderId}\``,
                inline: true
              },
              {
                name: '👤 Customer',
                value: customerText,
                inline: true
              },
              {
                name: '🛡️ Staff',
                value:
                  `<@${interaction.user.id}>`,
                inline: true
              },
              {
                name: '🔐 Code',
                value: `\`${code}\``,
                inline: false
              },
              {
                name: '📍 Ticket',
                value:
                  `<#${interaction.channel.id}>`,
                inline: true
              },
              {
                name: '🕐 Delivered At',
                value:
                  `<t:${deliveredAt}:F>`,
                inline: true
              },
              {
                name: '📊 Status',
                value: '🟡 Pending',
                inline: true
              }
            )
            .setFooter({
              text:
                'Casper Shop • Delivery Logs'
            })
            .setTimestamp();

        const logMessage =
          await logChannel.send({
            embeds: [logEmbed]
          });

        // =========================
        // DELIVERY BUTTONS
        // =========================

        const copyButton =
          new ButtonBuilder()
            .setCustomId(
              `copy_code:${logMessage.id}`
            )
            .setLabel('COPY CODE')
            .setEmoji('📋')
            .setStyle(
              ButtonStyle.Primary
            );

        const doneButton =
          new ButtonBuilder()
            .setCustomId(
              `delivery_done:${logMessage.id}`
            )
            .setLabel('DONE')
            .setEmoji('✅')
            .setStyle(
              ButtonStyle.Success
            );

        const rateButton =
          new ButtonBuilder()
            .setCustomId(
              `rate_order:${orderId}`
            )
            .setLabel('RATE US')
            .setEmoji('⭐')
            .setStyle(
              ButtonStyle.Primary
            );

        const row =
          new ActionRowBuilder()
            .addComponents(
              copyButton,
              doneButton,
              rateButton
            );

        await interaction.editReply({
          components: [row]
        });

        console.log(
          `Delivery created | Order: ${orderId} | Customer: ${
            customer?.user.tag ||
            'Unknown'
          } | Staff: ${interaction.user.tag} | Code: ${code}`
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

    if (interaction.isButton()) {

      // =========================
      // COPY CODE
      // =========================

      if (
        interaction.customId.startsWith(
          'copy_code:'
        )
      ) {

        const embed =
          interaction.message.embeds[0];

        const description =
          embed?.description || '';

        const match =
          description.match(
            /\*\*🔐 Your Code:\*\*\s*\n`([^`]+)`/
          );

        if (!match) {
          return interaction.reply({
            content:
              '❌ Could not find the code in this delivery message.',
            ephemeral: true
          });
        }

        const code = match[1];

        await interaction.reply({
          content:
            `📋 **Your Code:**\n\`${code}\`\n\n` +
            'You can copy it from the message above.',
          ephemeral: true
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

        // Prevent duplicate rating
        if (ratings[ratingKey]) {
          return interaction.reply({
            content:
              '⚠️ **You have already rated this order.**\n\n' +
              `Order: \`${orderId}\`\n\n` +
              '❤️ Thank you for your feedback!',
            ephemeral: true
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
                .setEmoji('⭐')
                .setStyle(
                  rating >= 4
                    ? ButtonStyle.Success
                    : rating >= 3
                      ? ButtonStyle.Primary
                      : ButtonStyle.Secondary
                )
          );

        const ratingRow =
          new ActionRowBuilder()
            .addComponents(
              ratingButtons
            );

        await interaction.reply({
          content:
            `⭐ **Rate your Casper Shop order**\n` +
            `Order: \`${orderId}\`\n\n` +
            'Please choose a rating from 1 to 5 stars.',
          components: [ratingRow],
          ephemeral: true
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
          interaction.customId.split(':');

        const orderId = parts[1];
        const rating =
          Number(parts[2]);

        if (
          !orderId ||
          !Number.isInteger(rating) ||
          rating < 1 ||
          rating > 5
        ) {
          return interaction.reply({
            content:
              '❌ Invalid rating.',
            ephemeral: true
          });
        }

        const ratingKey =
          `${orderId}:${interaction.user.id}`;

        // Double-check duplicate
        if (ratings[ratingKey]) {
          return interaction.update({
            content:
              '⚠️ **You have already rated this order.**',
            components: []
          });
        }

        // =========================
        // FEEDBACK MODAL
        // =========================

        const modal =
          new ModalBuilder()
            .setCustomId(
              `feedback_modal:${orderId}:${rating}`
            )
            .setTitle(
              '⭐ Casper Shop Feedback'
            );

        const feedbackInput =
          new TextInputBuilder()
            .setCustomId(
              'feedback'
            )
            .setLabel(
              'How was your experience?'
            )
            .setPlaceholder(
              'Write your feedback here...'
            )
            .setStyle(
              TextInputStyle.Paragraph
            )
            .setRequired(false)
            .setMaxLength(1000);

        const feedbackRow =
          new ActionRowBuilder()
            .addComponents(
              feedbackInput
            );

        modal.addComponents(
          feedbackRow
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
          interaction.message.embeds[0];

        if (!oldEmbed) {
          return interaction.reply({
            content:
              '❌ Delivery message could not be read.',
            ephemeral: true
          });
        }

        // =========================
        // COMPLETED DELIVERY EMBED
        // =========================

        const completedEmbed =
          new EmbedBuilder(
            oldEmbed.toJSON()
          )
            .setColor('#2E7D32')
            .setTitle(
              '✅ DELIVERY COMPLETED'
            )
            .setFooter({
              text:
                `Casper Shop • Completed by ${interaction.user.username}`
            })
            .setTimestamp();

        // =========================
        // KEEP ALL BUTTONS
        // =========================

        const copyButton =
          new ButtonBuilder()
            .setCustomId(
              `copy_code:${logMessageId}`
            )
            .setLabel(
              'COPY CODE'
            )
            .setEmoji('📋')
            .setStyle(
              ButtonStyle.Primary
            );

        const completedButton =
          new ButtonBuilder()
            .setCustomId(
              'delivery_completed'
            )
            .setLabel(
              'COMPLETED'
            )
            .setEmoji('✅')
            .setStyle(
              ButtonStyle.Secondary
            )
            .setDisabled(true);

        // =========================
        // GET ORDER ID
        // =========================

        const orderField =
          oldEmbed.fields?.find(
            field =>
              field.name ===
              '🧾 Order ID'
          );

        const orderIdMatch =
          orderField?.value?.match(
            /`([^`]+)`/
          );

        const orderId =
          orderIdMatch
            ? orderIdMatch[1]
            : 'unknown';

        const rateButton =
          new ButtonBuilder()
            .setCustomId(
              `rate_order:${orderId}`
            )
            .setLabel(
              'RATE US'
            )
            .setEmoji('⭐')
            .setStyle(
              ButtonStyle.Primary
            );

        const row =
          new ActionRowBuilder()
            .addComponents(
              copyButton,
              completedButton,
              rateButton
            );

        await interaction.update({
          embeds: [completedEmbed],
          components: [row]
        });

        // =========================
        // UPDATE DELIVERY LOG
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

          const fields =
            oldLogEmbed.fields
              .filter(
                field =>
                  field.name !==
                  '📊 Status'
              )
              .filter(
                field =>
                  field.name !==
                  '✅ Completed By'
              )
              .filter(
                field =>
                  field.name !==
                  '🕐 Completed At'
              )
              .map(
                field => ({
                  name: field.name,
                  value: field.value,
                  inline: field.inline
                })
              );

          const completedAt =
            Math.floor(
              Date.now() / 1000
            );

          const completedLogEmbed =
            new EmbedBuilder()
              .setColor('#2E7D32')
              .setTitle(
                '✅ DELIVERY COMPLETED'
              )
              .addFields(
                ...fields,
                {
                  name: '📊 Status',
                  value:
                    '🟢 Completed',
                  inline: true
                },
                {
                  name:
                    '✅ Completed By',
                  value:
                    `<@${interaction.user.id}>`,
                  inline: true
                },
                {
                  name:
                    '🕐 Completed At',
                  value:
                    `<t:${completedAt}:F>`,
                  inline: true
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
            `Delivery completed | Completed by: ${interaction.user.tag}`
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

    if (interaction.isModalSubmit()) {

      if (
        !interaction.customId.startsWith(
          'feedback_modal:'
        )
      ) {
        return;
      }

      const parts =
        interaction.customId.split(':');

      const orderId = parts[1];
      const rating =
        Number(parts[2]);

      if (
        !orderId ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return interaction.reply({
          content:
            '❌ Invalid rating submission.',
          ephemeral: true
        });
      }

      const ratingKey =
        `${orderId}:${interaction.user.id}`;

      // Prevent duplicate submission
      if (ratings[ratingKey]) {
        return interaction.reply({
          content:
            '⚠️ **You have already rated this order.**',
          ephemeral: true
        });
      }

      const feedback =
        interaction.fields
          .getTextInputValue(
            'feedback'
          )
          ?.trim() ||
        'No written feedback provided.';

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
          ephemeral: true
        });
      }

      // =========================
      // STARS
      // =========================

      const stars =
        '⭐'.repeat(rating) +
        '☆'.repeat(
          5 - rating
        );

      // =========================
      // REVIEW EMBED
      // =========================

      const reviewEmbed =
        new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle(
            ' NEW CUSTOMER REVIEW'
          )
          .setDescription(
            `**${stars}**\n\n` +
            `> ${feedback}\n\n` +
            'Thank you for rating **Casper Shop**! ❤️'
          )
          .addFields(
            {
              name: '🧾 Order ID',
              value:
                `\`${orderId}\``,
              inline: true
            },
            {
              name: '👤 Customer',
              value:
                `<@${interaction.user.id}>`,
              inline: true
            },
            {
              name: '⭐ Rating',
              value:
                `**${rating}/5**`,
              inline: true
            }
          )
          .setFooter({
            text:
              'Casper Shop • Customer Reviews'
          })
          .setTimestamp();

      // =========================
      // SEND REVIEW
      // =========================

      await reviewChannel.send({
        embeds: [
          reviewEmbed
        ]
      });

      // =========================
      // SAVE RATING
      // =========================

      ratings[ratingKey] = {
        orderId,
        userId:
          interaction.user.id,
        rating,
        feedback,
        submittedAt:
          new Date().toISOString()
      };

      saveRatings(
        ratings
      );

      // =========================
      // SUCCESS MESSAGE
      // =========================

      await interaction.reply({
        content:
          `✅ **Thank you!** Your rating of ` +
          `**${rating}/5 ⭐** has been submitted.\n\n` +
          '❤️ We appreciate your feedback!',
        ephemeral: true
      });

      console.log(
        `Review submitted | Order: ${orderId} | ` +
        `Rating: ${rating}/5 | Customer: ${interaction.user.tag}`
      );

      return;
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
      /^["']|["']$/g,
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
```

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
  SlashCommandBuilder
} = require('discord.js');

const LOG_CHANNEL_ID = '1547699058091761826';

// Persistent Order ID counter
const COUNTER_FILE = path.join(__dirname, 'order-counter.json');

function getNextOrderId() {
  let lastOrder = 0;

  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
      lastOrder = Number(data.lastOrder) || 0;
    }
  } catch (error) {
    console.error('Could not read order counter:', error);
  }

  lastOrder += 1;

  try {
    fs.writeFileSync(
      COUNTER_FILE,
      JSON.stringify({ lastOrder }, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('Could not save order counter:', error);
  }

  return `CS-${String(lastOrder).padStart(6, '0')}`;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

const command = new SlashCommandBuilder()
  .setName('deliver')
  .setDescription('Deliver a PUBG Steam code')
  .addStringOption(option =>
    option
      .setName('code')
      .setDescription('Enter the Steam code')
      .setRequired(true)
  );

async function findTicketCustomer(channel) {
  const overwrites = channel.permissionOverwrites.cache;

  for (const overwrite of overwrites.values()) {
    if (overwrite.type !== 1) continue;

    try {
      const member = await channel.guild.members.fetch(overwrite.id);

      if (member.user.bot) continue;

      return member;
    } catch {
      continue;
    }
  }

  return null;
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' })
    .setToken(process.env.DISCORD_TOKEN);

  for (const [guildId] of client.guilds.cache) {
    try {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        { body: [command.toJSON()] }
      );

      console.log(`Command registered for server: ${guildId}`);
    } catch (error) {
      console.error(error);
    }
  }

  console.log('Casper Shop Bot is online!');
});

client.on('interactionCreate', async interaction => {

  // /deliver
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName !== 'deliver') return;

    if (!interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageMessages
    )) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true
      });
    }

    const code = interaction.options.getString('code', true);

    const customer = await findTicketCustomer(interaction.channel);

    const customerText = customer
      ? `<@${customer.id}>`
      : 'Customer not detected';

    const orderId = getNextOrderId();
    const deliveredAt = Math.floor(Date.now() / 1000);

    // Delivery message
    const embed = new EmbedBuilder()
      .setColor('#8B0000')
      .setTitle('🎁 CODE DELIVERY — CASPER SHOP')
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
        text: 'Casper Shop • PUBG STEAM'
      })
      .setTimestamp();

    // Temporary button while the log is created
    const temporaryButton = new ButtonBuilder()
      .setCustomId('delivery_loading')
      .setLabel('DONE')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true);

    const temporaryRow = new ActionRowBuilder()
      .addComponents(temporaryButton);

    await interaction.reply({
      embeds: [embed],
      components: [temporaryRow]
    });

    try {
      // Delivery log
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);

      if (!logChannel) {
        throw new Error('Delivery log channel not found.');
      }

      const logEmbed = new EmbedBuilder()
        .setColor('#8B0000')
        .setTitle('📦 NEW CODE DELIVERY')
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
            value: `<@${interaction.user.id}>`,
            inline: true
          },
          {
            name: '🔐 Code',
            value: `\`${code}\``,
            inline: false
          },
          {
            name: '📍 Ticket',
            value: `<#${interaction.channel.id}>`,
            inline: true
          },
          {
            name: '🕐 Delivered At',
            value: `<t:${deliveredAt}:F>`,
            inline: true
          },
          {
            name: '📊 Status',
            value: '🟡 Pending',
            inline: true
          }
        )
        .setFooter({
          text: 'Casper Shop • Delivery Logs'
        })
        .setTimestamp();

      const logMessage = await logChannel.send({
        embeds: [logEmbed]
      });

      // COPY CODE
      const copyButton = new ButtonBuilder()
        .setCustomId(`copy_code:${encodeURIComponent(code)}`)
        .setLabel('COPY CODE')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Primary);

      // DONE
      const doneButton = new ButtonBuilder()
        .setCustomId(`delivery_done:${logMessage.id}`)
        .setLabel('DONE')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success);

      // RATE US
      const rateButton = new ButtonBuilder()
        .setLabel('RATE US')
        .setEmoji('⭐')
        .setStyle(ButtonStyle.Link)
        .setURL(
          'https://discord.com/channels/939586775561695332/1396875023905591356'
        );

      // 3 buttons
      const row = new ActionRowBuilder()
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
          customer?.user.tag || 'Unknown'
        } | Staff: ${interaction.user.tag} | Code: ${code}`
      );

    } catch (error) {
      console.error('Could not create delivery log:', error);
    }

    return;
  }

  // Buttons
  if (interaction.isButton()) {

    // COPY CODE
    if (interaction.customId.startsWith('copy_code:')) {

      const encodedCode = interaction.customId.substring(
        'copy_code:'.length
      );

      const code = decodeURIComponent(encodedCode);

      await interaction.reply({
        content:
          `📋 **Your Code:**\n\`${code}\`\n\n` +
          'You can copy it from the message above.',
        ephemeral: true
      });

      return;
    }

    // DONE
    if (interaction.customId.startsWith('delivery_done:')) {

      const logMessageId = interaction.customId.split(':')[1];
      const oldEmbed = interaction.message.embeds[0];

      const completedEmbed = new EmbedBuilder(oldEmbed.toJSON())
        .setColor('#2E7D32')
        .setTitle('✅ DELIVERY COMPLETED')
        .setFooter({
          text: `Casper Shop • Completed by ${interaction.user.username}`
        })
        .setTimestamp();

      const completedButton = new ButtonBuilder()
        .setCustomId('delivery_completed')
        .setLabel('COMPLETED')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      const row = new ActionRowBuilder()
        .addComponents(completedButton);

      await interaction.update({
        embeds: [completedEmbed],
        components: [row]
      });

      // Update delivery log
      try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        const logMessage = await logChannel.messages.fetch(logMessageId);

        const oldLogEmbed = logMessage.embeds[0];

        const fields = oldLogEmbed.fields
          .filter(field => field.name !== '📊 Status')
          .filter(field => field.name !== '✅ Completed By')
          .filter(field => field.name !== '🕐 Completed At')
          .map(field => ({
            name: field.name,
            value: field.value,
            inline: field.inline
          }));

        const completedAt = Math.floor(Date.now() / 1000);

        const completedLogEmbed = new EmbedBuilder()
          .setColor('#2E7D32')
          .setTitle('✅ DELIVERY COMPLETED')
          .addFields(
            ...fields,
            {
              name: '📊 Status',
              value: '🟢 Completed',
              inline: true
            },
            {
              name: '✅ Completed By',
              value: `<@${interaction.user.id}>`,
              inline: true
            },
            {
              name: '🕐 Completed At',
              value: `<t:${completedAt}:F>`,
              inline: true
            }
          )
          .setFooter({
            text: 'Casper Shop • Delivery Logs'
          })
          .setTimestamp();

        await logMessage.edit({
          embeds: [completedLogEmbed]
        });

        console.log(
          `Delivery completed | Completed by: ${interaction.user.tag}`
        );

      } catch (error) {
        console.error('Could not update delivery log:', error);
      }

      return;
    }
  }
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN
  ?.trim()
  .replace(/^["']|["']$/g, '');

if (!DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is missing.');
  process.exit(1);
}

client.login(DISCORD_TOKEN);

const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const token = process.env.TOKEN;
const channelToJoin = process.env.CHANNEL_ID.split(",").map((id) => id.trim());
const textChannelIds = process.env.TEXT_CHANNEL_ID.split(",").map((id) => id.trim());

const dynamicChannels = new Set();

client.once("ready", () => {
  console.log("Bot is online!");
});


client.on("voiceStateUpdate", async (oldState, newState) => {
  if (
    channelToJoin.includes(newState.channelId) &&
    oldState.channelId !== newState.channelId
  ) {
    try {
      const user = newState.member.user;
      const dmChannel = await user.createDM();
      const parentCategoryId = newState.channel.parentId;
      const category = parentCategoryId
        ? newState.guild.channels.cache.get(parentCategoryId)
        : null;

      const botMessage = await dmChannel.send(
        `Hi ${
          newState.member.nickname || newState.member.user.username
        }! You are creating a temporary voice channel in the ${
          category ? `"${category.name}" section` : "uncategorized section"
        }. What would you like to name it? 
        
        If you do not want to create a channel, type "Leave".`
      );

      const collectedMessages = await dmChannel
        .awaitMessages({
          max: 1,
          time: 45000,
          errors: ["time"],
          filter: (msg) => !msg.author.bot,
        })
        .catch(() => null);

      if (!collectedMessages) {
        await dmChannel.send("You didn't respond in time. Please try again.");
        await newState.member.voice.setChannel(null);
        return;
      }

      const response = collectedMessages.first()?.content.trim().toLowerCase();

      if (response === "leave") {
        await dmChannel.send("You have been removed from the channel.");
        await newState.member.voice.setChannel(null);
        return;
      }

      let channelName = response;

      if (channelName && channelName.length > 100) {
        channelName = channelName.substring(0, 100);
      }

      channelName = channelName.replace(/[^a-zA-Z0-9 _-]/g, "").trim();

      console.log(
        `${newState.member.nickname || user.username} named the channel: ${channelName}`
      );

      const newChannel = await newState.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: parentCategoryId,
        reason: "Auto-created new channel when user joined",
      });

      dynamicChannels.add(newChannel.id);

      await newState.member.voice.setChannel(newChannel);
      await dmChannel.send(
        `You have been moved to your new channel - "${newChannel.name}". Have fun!`
      );

      const confirmMessage = await dmChannel.send(
        `Would you like to notify others that you're in the voice channel "${newChannel.name}"? Reply with "yes" or "no".`
      );

      const confirmResponse = await dmChannel
        .awaitMessages({
          max: 1,
          time: 30000,
          errors: ["time"],
          filter: (msg) =>
            !msg.author.bot &&
            ["yes", "no"].includes(msg.content.trim().toLowerCase()),
        })
        .catch(() => null);

      if (confirmResponse?.first()?.content.trim().toLowerCase() === "yes") {
        const matchingTextChannel = textChannelIds
          .map((id) => newState.guild.channels.cache.get(id))
          .find(
            (channel) =>
              channel &&
              channel.type === ChannelType.GuildText &&
              channel.parentId === parentCategoryId
          );

        if (matchingTextChannel) {
          await matchingTextChannel.send(
            `Hey everyone! ${
              newState.member.nickname || user.username
            } is hanging out in the "${newChannel.name}" voice channel. Feel free to join in!`
          );
          await dmChannel.send("Your message has been posted.");
        } else {
          await dmChannel.send(
            "Sorry, I couldn't find a matching text channel for this group."
          );
        }
      } else {
        await dmChannel.send("No problem! Have a great time in the voice channel.");
      }
    } catch (error) {
      console.error(
        "Error while creating a new channel or moving user:",
        error
      );
    }
  }

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const oldChannel = oldState.guild.channels.cache.get(oldState.channelId);

    if (oldChannel) {
      console.log(
        `Checking channel: ${oldChannel.name} | Members: ${oldChannel.members.size}`
      );

      if (oldChannel.members.size === 0 && dynamicChannels.has(oldChannel.id)) {
        try {
          await oldChannel.delete("Channel is empty and has no members.");
          console.log(`Deleted channel: ${oldChannel.name}`);
          dynamicChannels.delete(oldChannel.id);
        } catch (error) {
          console.error("Error while deleting the channel:", error);
        }
      }
    }
  }
});

client.login(token);

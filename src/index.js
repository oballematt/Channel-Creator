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
        .catch((error) => {
          console.error(
            "Error collecting messages or timeout occurred:",
            error
          );
          return null;
        });

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
        `${newState.member.nickname} named the channel: ${channelName}`
      );

      const categoryId = newState.channel.parentId;
      const newChannel = await newState.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: categoryId,
        reason: "Auto-created new channel when user joined",
      });

      dynamicChannels.add(newChannel.id);

      await newState.member.voice.setChannel(newChannel);
      console.log(
        `Moved ${newState.member.nickname} to the new voice channel ${newChannel.name}`
      );
      await dmChannel.send(
        `You have been moved to your new channel - "${newChannel.name}". Have fun!`
      );
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
    } else {
      console.log(`Channel with ID ${oldState.channelId} not found.`);
    }
  }
});

client.login(token);

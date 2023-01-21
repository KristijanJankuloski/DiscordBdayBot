require('dotenv').config();
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, REST, Routes, PermissionFlagsBits } = require('discord.js');
const cron = require('node-cron');

const client = new Client({intents: [GatewayIntentBits.Guilds]});

let channelId = '1055933041157099625';
let roleId = '1057081866324295741';
let guildId = '1055933040175611914';

mongoose.set('strictQuery', false);
mongoose.connect(process.env.REMOTE_URL);

const schema = mongoose.Schema({
  guildId: String,
  userid: String, 
  username: String,
  month: Number, 
  day: Number
});

const guildSchema = mongoose.Schema({
  guildId: String,
  roleId: String,
  channelId: String
});

const activeRolesSchema = mongoose.Schema({
  guildId: String,
  roleId: String,
  userId: String
});

const BirthDay = mongoose.model('birthdays', schema);
const GuildConfig = mongoose.model('guilds', guildSchema);
const ActiveRoles = mongoose.model('activeroles', activeRolesSchema);

async function addBirthday(guildId, userid, username, month, day){
  const user = new BirthDay();
  user.guildId = guildId;
  user.userid = userid;
  user.username = username;
  user.month = month;
  user.day = day;
  await user.save();
}

async function addActiveRole(guildId, userid, roleId){
  const active = new ActiveRoles();
  active.guildId = guildId;
  active.userId = userid;
  active.roleId = roleId;
  await active.save();
}

async function addGuildConfig(guildId, channelId, roleId){
  exists = await GuildConfig.findOne({guildId:guildId});
  if(exists){
    const guildConf = new GuildConfig();
    guildConf.guildId = guildId;
    guildConf.channelId = channelId;
    guildConf.roleId = roleId;
    GuildConfig.findOneAndUpdate({guildId:guildId}, guildConf);
  }
  const guildConf = new GuildConfig();
  guildConf.guildId = guildId;
  guildConf.channelId = channelId;
  guildConf.roleId = roleId;
  await guildConf.save();
}

async function findBday(Inmonth, Inday){
  let bdays = await BirthDay.find({month:Inmonth, day:Inday});
  return bdays;
}

async function findGuildConf(searchGuildId){
  let gConf = await GuildConfig.findOne({guildId:searchGuildId});
  return gConf;
}

async function deleteBday(userid){
  await BirthDay.deleteOne({userid:userid});
}

const commands = [
  {
    name: 'add',
    description: 'Replies with Hello!',
    options: [
      {
        name: "date",
        description: "date of bday day/month",
        type: 3,
        required: true
      },
      {
        name: "user",
        description: "the user to set the date to",
        type: 6,
        required: false
      }
    ]
  },
  {
    name: "config",
    description: "Server configuration for channel and role",
    options: [
      {
        name: "channel",
        description: "The channel ID to be set",
        type: 3,
        required: true
      },
      {
        name: "role",
        description: "The role ID to be set",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: "delete",
    description: "Deletes a birthday for a user",
    options: [
      {
        name: "user",
        description: "Users bday to be deleted",
        type: 6,
        required: false
      }
    ]
  }
]

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

client.on('ready', () =>{
  console.log("Client Logged in");
  cron.schedule('01 00 00 * * *', async () =>{
    let today = new Date();
    let dataList = await findBday(today.getMonth()+1, today.getDate());
    // Find and remove all member that have a b-day role active
    let allActiveRoles = await ActiveRoles.find();
    if(allActiveRoles.length > 0){
      for(active of allActiveRoles){
        const guild = client.guilds.cache.get(active.guildId);
        const role = guild.roles.cache.get(active.roleId);
        let member = await guild.members.fetch(active.userId);
        member.roles.remove(role);
        await ActiveRoles.deleteOne({guildId: active.guildId, userId: active.userId});
      }
    }
    // Check if there is a b-day on this day
    if(dataList.length === 0){
      console.log("No bday today");
      return;
    }
    // IF there is add the role to the user and Send a message
    for(let data of dataList){
      const guild = client.guilds.cache.get(data.guildId);
      let config = await findGuildConf(data.guildId);
      guild.members.fetch(data.userid).then(member => {
        const bdayRole = guild.roles.cache.find(role => role.id === config.roleId);
        member.roles.add(bdayRole);
        addActiveRole(config.guildId, data.userid, config.roleId);
      }).catch(console.error);
      client.channels.cache.get(config.channelId).send(`@everyone wish <@${data.userid}> a happy Birthday`);
    }
  });
});


client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // ADDING BIRHTDAY COMMAND
    if (interaction.commandName === 'add') {
      let newDate = interaction.options.getString('date').split('/');
      let user = interaction.options.getUser('user')?? interaction.user;
      let guild = interaction.guild.id;
      await interaction.deferReply();
      await addBirthday(guild, user.id, user.tag, Number(newDate[1]), Number(newDate[0]));
      await interaction.followUp(`BirthDay for <@${user.id}> is set to ${Number(newDate[0])}/${Number(newDate[1])}`);
    }

    // CONFIGURATION COMMAND
    if (interaction.commandName === 'config'){
      await interaction.deferReply();
      if(!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)){
        await interaction.followUp("You do not have permissions for this command");
        return;
      }
      let temp = interaction.options.getString('channel').split('');
      temp.shift();
      temp.shift();
      temp.pop();
      channelId = temp.join('');
      let tempRole = interaction.options.getString('role').split('');
      tempRole.shift();
      tempRole.shift();
      tempRole.shift();
      tempRole.pop();
      roleId = tempRole.join('');
      guildId = interaction.guild.id;
      await addGuildConfig(guildId, channelId, roleId);
      await interaction.followUp(`Message channel has been set to <#${channelId}> and role to <@&${roleId}>`);
    }

    // REMOVING B-DAY COMMAND
    if (interaction.commandName === 'delete'){
      let user = interaction.options.getUser('user')?? interaction.user;
      await interaction.deferReply()
      await deleteBday(user.id);
      await interaction.followUp(`Birthday for <@${user.id}> has beed deleted`);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
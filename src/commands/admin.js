const {
  SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const db = require("../database");

const SECTIONS = {
  users: ["👥 Участники", "Просмотр профилей и статистики участников."],
  moderation: ["🛡️ Модерация", "Наказания и журнал модерации."],
  roles: ["👑 Роли и права", "Назначение ролей доступа к панели."],
  rp: ["🎭 RP-действия", "Создание и управление ключевыми словами."],
  settings: ["⚙️ Настройки сервера", "Приветствия, роли и каналы."],
  stats: ["📊 Статистика", "Состояние сервера и активность."],
  logs: ["📜 Журнал аудита", "Последние действия администраторов."],
};

function audit(guildId, actorId, action, targetId = null, details = "") {
  db.prepare("INSERT INTO admin_audit (guild_id, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)")
    .run(guildId, actorId, action, targetId, String(details).slice(0, 900));
}
function isOwner(interaction) {
  const owners = interaction.client.config?.ownerIds || [];
  return owners.includes(interaction.user.id);
}
function hasGuildAdmin(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}
function allowed(interaction, section) {
  if (!interaction.guild || !interaction.member) return false;
  if (isOwner(interaction) || hasGuildAdmin(interaction)) return true;
  const roleIds = interaction.member.roles?.cache
    ? [...interaction.member.roles.cache.keys()]
    : Array.isArray(interaction.member.roles) ? interaction.member.roles : [];
  if (!roleIds.length) return false;
  const placeholders = roleIds.map(() => "?").join(",");
  const row = db.prepare(`SELECT 1 FROM admin_access_roles WHERE guild_id=? AND section IN (?, 'all') AND role_id IN (${placeholders}) LIMIT 1`)
    .get(interaction.guildId, section, ...roleIds);
  return Boolean(row);
}
function mainEmbed(guild) {
  return new EmbedBuilder().setColor(0x5865f2).setTitle("🕊 HeradeLegend • Административная панель")
    .setDescription("Выбери раздел ниже. Доступ к разделам проверяется при каждом действии.")
    .addFields(
      { name: "Сервер", value: guild.name, inline: true },
      { name: "Участники", value: String(guild.memberCount), inline: true },
      { name: "Разделы", value: String(Object.keys(SECTIONS).length), inline: true },
    ).setFooter({ text: "Дух Свободы 🕊 • Действия фиксируются в аудите" });
}
function mainRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ha:users").setLabel("Участники").setEmoji("👥").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("ha:moderation").setLabel("Модерация").setEmoji("🛡️").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("ha:roles").setLabel("Роли и права").setEmoji("👑").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ha:rp").setLabel("RP-действия").setEmoji("🎭").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ha:settings").setLabel("Настройки").setEmoji("⚙️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ha:stats").setLabel("Статистика").setEmoji("📊").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("ha:logs").setLabel("Аудит").setEmoji("📜").setStyle(ButtonStyle.Secondary),
    ),
  ];
}
function backRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ha:home").setLabel("Главная панель").setEmoji("🏠").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ha:refresh").setLabel("Обновить").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
  );
}
function idModal(customId, title, label = "Discord ID участника", placeholder = "Например: 123456789012345678") {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId("target_id").setLabel(label).setPlaceholder(placeholder)
      .setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true),
  ));
  return modal;
}
function validId(id) { return /^\d{17,20}$/.test(id); }

module.exports = {
  data: new SlashCommandBuilder().setName("admin").setDescription("Открыть административную панель HeradeLegend."),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Панель доступна только на сервере.", flags: MessageFlags.Ephemeral });
    if (!isOwner(interaction) && !hasGuildAdmin(interaction) && !Object.keys(SECTIONS).some((section) => allowed(interaction, section))) {
      return interaction.reply({ content: "⛔ Нет доступа к административной панели. Нужны права администратора или назначенная роль персонала.", flags: MessageFlags.Ephemeral });
    }
    await interaction.reply({ embeds: [mainEmbed(interaction.guild)], components: mainRows(), flags: MessageFlags.Ephemeral });
  },
  async handle(interaction) {
    if (!interaction.customId?.startsWith("ha:")) return false;
    if (!interaction.inGuild()) {
      await interaction.reply({ content: "Панель доступна только на сервере.", flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    const id = interaction.customId;
    if (id === "ha:home" || id === "ha:refresh") {
      if (!isOwner(interaction) && !hasGuildAdmin(interaction) && !Object.keys(SECTIONS).some((section) => allowed(interaction, section))) {
        await interaction.reply({ content: "⛔ Нет доступа.", flags: MessageFlags.Ephemeral }); return true;
      }
      const payload = { embeds: [mainEmbed(interaction.guild)], components: mainRows(), flags: MessageFlags.Ephemeral };
      if (interaction.isButton()) await interaction.update(payload);
      else await interaction.reply(payload);
      return true;
    }
    if (interaction.isButton() && id.startsWith("ha:")) {
      const section = id.slice(3);
      if (!SECTIONS[section] || !allowed(interaction, section)) {
        await interaction.reply({ content: "⛔ У тебя нет разрешения на этот раздел.", flags: MessageFlags.Ephemeral }); return true;
      }
      if (section === "users") {
        await interaction.reply({ content: "Выбери действие с участником.", components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ha:user:lookup").setLabel("Найти участника").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("ha:user:xp").setLabel("Изменить XP").setStyle(ButtonStyle.Secondary),
          ), backRow(),
        ], flags: MessageFlags.Ephemeral }); return true;
      }
      if (section === "moderation") {
        await interaction.reply({ content: "Выбери действие. Все наказания требуют указать цель и причину.", components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ha:mod:prepare").setLabel("Наказать участника").setEmoji("🛡️").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("ha:mod:logs").setLabel("Последние наказания").setStyle(ButtonStyle.Secondary),
          ), backRow(),
        ], flags: MessageFlags.Ephemeral }); return true;
      }
      if (section === "roles") {
        const roles = interaction.guild.roles.cache.filter(r => r.id !== interaction.guildId && !r.managed).sort((a,b) => b.position-a.position).first(25);
        const options = roles.map(r => ({ label: r.name.slice(0,100), value: r.id, description: `Роль · ${r.id}`.slice(0,100) }));
        if (!options.length) {
          await interaction.reply({ content: "На сервере нет подходящих ролей для назначения доступа.", components: [backRow()], flags: MessageFlags.Ephemeral });
          return true;
        }
        await interaction.reply({ content: "Выбери роль, которой нужно выдать или снять доступ к разделам панели.", components: [
          new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("ha:roles:select").setPlaceholder("Выбери роль").addOptions(options)),
          new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("ha:roles:section").setPlaceholder("Раздел доступа").addOptions(
            {label:"Вся панель",value:"all"},{label:"Участники",value:"users"},{label:"Модерация",value:"moderation"},
            {label:"RP-действия",value:"rp"},{label:"Настройки",value:"settings"},{label:"Статистика",value:"stats"},{label:"Аудит",value:"logs"}
          )),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ha:roles:grant").setLabel("Выдать доступ").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("ha:roles:revoke").setLabel("Снять доступ").setStyle(ButtonStyle.Danger),
          ), backRow(),
        ], flags: MessageFlags.Ephemeral }); return true;
      }
      if (section === "rp") {
        const rows = db.prepare("SELECT id,name,trigger_text,response,is_enabled FROM rp_actions WHERE guild_id=? ORDER BY id DESC LIMIT 10").all(interaction.guildId);
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🎭 RP-действия")
          .setDescription(rows.length ? rows.map(r => `**#${r.id} · ${r.name}** — ${r.is_enabled ? "🟢 включено" : "🔴 выключено"}\nТриггер: \`${r.trigger_text}\`\nОтвет: ${r.response.slice(0,120)}`).join("\n\n") : "Пока нет RP-действий.");
        await interaction.reply({ embeds: [embed], components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ha:rp:create").setLabel("Создать действие").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("ha:rp:toggle").setLabel("Включить/выключить").setStyle(ButtonStyle.Secondary),
          ), backRow(),
        ], flags: MessageFlags.Ephemeral }); return true;
      }
      if (section === "settings") {
        const row = db.prepare("SELECT * FROM guild_settings WHERE guild_id=?").get(interaction.guildId);
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("⚙️ Настройки сервера")
          .addFields(
            {name:"Приветствия",value:row?.welcome_channel_id ? `Канал: <#${row.welcome_channel_id}>\nТекст: ${(row.welcome_message || "по умолчанию").slice(0,850)}` : "Не настроено",inline:true},
            {name:"Сообщения об уходе",value:row?.goodbye_channel_id ? `Канал: <#${row.goodbye_channel_id}>\nТекст: ${(row.goodbye_message || "по умолчанию").slice(0,850)}` : "Не настроено",inline:true},
            {name:"Автоматическая роль",value:row?.autorole_id ? `<@&${row.autorole_id}>` : "Не настроено",inline:true},
            {name:"Журнал модерации",value:row?.mod_log_channel_id ? `<#${row.mod_log_channel_id}>` : "Не настроено",inline:true},
          ).setDescription("Подробное редактирование уже доступно через /serverconfig.");
        await interaction.reply({ embeds:[embed], components:[backRow()], flags:MessageFlags.Ephemeral }); return true;
      }
      if (section === "stats") {
        const members = interaction.guild.memberCount;
        const cases = db.prepare("SELECT COUNT(*) n FROM moderation_cases WHERE guild_id=?").get(interaction.guildId).n;
        const actions = db.prepare("SELECT COUNT(*) n FROM rp_actions WHERE guild_id=?").get(interaction.guildId).n;
        const tickets = db.prepare("SELECT COUNT(*) n FROM tickets WHERE guild_id=? AND status='open'").get(interaction.guildId).n;
        const embed = new EmbedBuilder().setColor(0x57f287).setTitle("📊 Статистика")
          .addFields({name:"Участники сервера",value:String(members),inline:true},{name:"Случаи модерации",value:String(cases),inline:true},
            {name:"RP-действия",value:String(actions),inline:true},{name:"Открытые тикеты",value:String(tickets),inline:true})
          .setTimestamp();
        await interaction.reply({ embeds:[embed], components:[backRow()], flags:MessageFlags.Ephemeral }); return true;
      }
      if (section === "logs") {
        const rows = db.prepare("SELECT actor_id,action,target_id,details,created_at FROM admin_audit WHERE guild_id=? ORDER BY id DESC LIMIT 12").all(interaction.guildId);
        const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("📜 Журнал аудита")
          .setDescription(rows.length ? rows.map(r => `<t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R> · <@${r.actor_id}> **${r.action}** ${r.target_id ? `→ <@${r.target_id}>` : ""}\n${r.details || "Без подробностей"}`).join("\n\n").slice(0,4000) : "Записей пока нет.");
        await interaction.reply({ embeds:[embed], components:[backRow()], flags:MessageFlags.Ephemeral }); return true;
      }
    }
    if (id === "ha:user:lookup" || id === "ha:user:xp") {
      if (!allowed(interaction, "users")) { await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral}); return true; }
      await interaction.showModal(idModal(id === "ha:user:xp" ? "ha:modal:xp" : "ha:modal:user", id === "ha:user:xp" ? "Изменить XP участника" : "Найти участника"));
      return true;
    }
    if (id === "ha:mod:prepare") {
      if (!allowed(interaction,"moderation")) { await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral}); return true; }
      const modal = idModal("ha:modal:mod","Подготовить модерацию");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Причина").setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true)));
      await interaction.showModal(modal); return true;
    }
    if (id === "ha:mod:logs") {
      if (!allowed(interaction,"moderation")) { await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral}); return true; }
      const rows=db.prepare("SELECT target_id,moderator_id,action,reason,created_at FROM moderation_cases WHERE guild_id=? ORDER BY id DESC LIMIT 10").all(interaction.guildId);
      const embed=new EmbedBuilder().setTitle("🛡️ Последние наказания").setColor(0xed4245).setDescription(rows.length?rows.map(r=>`<t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R> · **${r.action}** <@${r.target_id}>\nМодератор: <@${r.moderator_id}> · ${r.reason||"без причины"}`).join("\n\n").slice(0,4000):"Наказаний пока нет.");
      await interaction.reply({embeds:[embed],components:[backRow()],flags:MessageFlags.Ephemeral});return true;
    }
    if (id === "ha:roles:select" || id === "ha:roles:section") {
      if (!allowed(interaction,"roles")) { await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral}); return true; }
      const key = id.endsWith(":select") ? "roleId" : "section";
      interaction.client._adminSelections ||= new Map();
      const stateKey = `${interaction.guildId}:${interaction.user.id}`;
      const state = interaction.client._adminSelections.get(stateKey) || {};
      state[key] = interaction.values[0]; interaction.client._adminSelections.set(stateKey,state);
      await interaction.reply({content:key==="roleId"?"Роль выбрана. Теперь выбери раздел доступа.":"Раздел выбран. Нажми «Выдать доступ» или «Снять доступ».",flags:MessageFlags.Ephemeral});return true;
    }
    if (id === "ha:roles:grant" || id === "ha:roles:revoke") {
      if (!isOwner(interaction) && !hasGuildAdmin(interaction)) { await interaction.reply({content:"⛔ Только владелец бота или администратор сервера может менять права персонала.",flags:MessageFlags.Ephemeral});return true; }
      const state=interaction.client._adminSelections?.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!state?.roleId || !state?.section) { await interaction.reply({content:"Сначала выбери роль и раздел доступа.",flags:MessageFlags.Ephemeral});return true; }
      if(id.endsWith("grant")) {
        db.prepare("INSERT OR IGNORE INTO admin_access_roles(guild_id,role_id,section,granted_by) VALUES(?,?,?,?)").run(interaction.guildId,state.roleId,state.section,interaction.user.id);
        audit(interaction.guildId,interaction.user.id,"access_granted",state.roleId,state.section);
      } else {
        db.prepare("DELETE FROM admin_access_roles WHERE guild_id=? AND role_id=? AND section=?").run(interaction.guildId,state.roleId,state.section);
        audit(interaction.guildId,interaction.user.id,"access_revoked",state.roleId,state.section);
      }
      await interaction.reply({content:id.endsWith("grant")?"✅ Доступ выдан.":"✅ Доступ снят.",flags:MessageFlags.Ephemeral});return true;
    }
    if (id === "ha:rp:create") {
      if (!allowed(interaction,"rp")) { await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral});return true; }
      const modal=new ModalBuilder().setCustomId("ha:modal:rpcreate").setTitle("Новое RP-действие");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name").setLabel("Название").setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("trigger").setLabel("Ключевое слово / фраза").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("response").setLabel("Ответ бота").setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true)),
      );
      await interaction.showModal(modal);return true;
    }
    if (id === "ha:rp:toggle") {
      if (!allowed(interaction,"rp")) { await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral});return true; }
      const modal = new ModalBuilder().setCustomId("ha:modal:rptoggle").setTitle("Переключить RP-действие");
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("target_id").setLabel("Числовой ID действия").setPlaceholder("Например: 12")
          .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(10).setRequired(true),
      ));
      await interaction.showModal(modal);return true;
    }
    if (interaction.isModalSubmit() && id === "ha:modal:user") {
      if(!allowed(interaction,"users")){await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral});return true;}
      const target=interaction.fields.getTextInputValue("target_id").trim();
      if(!validId(target)){await interaction.reply({content:"Некорректный Discord ID.",flags:MessageFlags.Ephemeral});return true;}
      const member=await interaction.guild.members.fetch(target).catch(()=>null);
      const stats=db.prepare("SELECT * FROM member_stats WHERE guild_id=? AND user_id=?").get(interaction.guildId,target);
      const embed=new EmbedBuilder().setColor(member?0x57f287:0xfee75c).setTitle("👤 Профиль участника")
        .setDescription(member?member.toString():`Пользователь ${target} не найден на сервере (возможно, он покинул его).`)
        .addFields({name:"Discord ID",value:target,inline:true},{name:"XP",value:String(stats?.xp||0),inline:true},{name:"Уровень",value:String(stats?.level||0),inline:true},{name:"Баланс",value:String(stats?.balance||0),inline:true});
      audit(interaction.guildId,interaction.user.id,"user_lookup",target,"Профиль открыт");
      await interaction.reply({embeds:[embed],flags:MessageFlags.Ephemeral});return true;
    }
    if (interaction.isModalSubmit() && id === "ha:modal:xp") {
      if(!allowed(interaction,"users")){await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral});return true;}
      const target=interaction.fields.getTextInputValue("target_id").trim();
      if(!validId(target)){await interaction.reply({content:"Некорректный Discord ID.",flags:MessageFlags.Ephemeral});return true;}
      const modal=new ModalBuilder().setCustomId(`ha:modal:xpvalue:${target}`).setTitle("Изменить XP");
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("amount").setLabel("Изменение XP (+/-)").setPlaceholder("Например: 100 или -50").setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(8).setRequired(true)));
      await interaction.showModal(modal);return true;
    }
    if (interaction.isModalSubmit() && id.startsWith("ha:modal:xpvalue:")) {
      if(!allowed(interaction,"users")){await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral});return true;}
      const target=id.split(":").at(-1), amount=Number(interaction.fields.getTextInputValue("amount"));
      if(!validId(target)||!Number.isSafeInteger(amount)||amount===0||Math.abs(amount)>1000000){await interaction.reply({content:"Укажи целое изменение XP от -1 000 000 до 1 000 000, кроме нуля.",flags:MessageFlags.Ephemeral});return true;}
      db.prepare("INSERT INTO member_stats(guild_id,user_id,xp,level) VALUES(?,?,MAX(0,?),0) ON CONFLICT(guild_id,user_id) DO UPDATE SET xp=MAX(0,member_stats.xp+?)").run(interaction.guildId,target,amount,amount);
      audit(interaction.guildId,interaction.user.id,"xp_changed",target,String(amount));
      await interaction.reply({content:`✅ XP обновлён. Изменение: ${amount>0?"+":""}${amount}.`,flags:MessageFlags.Ephemeral});return true;
    }
    if (interaction.isModalSubmit() && id === "ha:modal:mod") {
      if(!allowed(interaction,"moderation")){await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral});return true;}
      const target=interaction.fields.getTextInputValue("target_id").trim(), reason=interaction.fields.getTextInputValue("reason").trim();
      if(!validId(target)||target===interaction.user.id){await interaction.reply({content:"Проверь ID. Нельзя применять это меню к самому себе.",flags:MessageFlags.Ephemeral});return true;}
      const member=await interaction.guild.members.fetch(target).catch(()=>null);
      if(!member){await interaction.reply({content:"Участник не найден на сервере. Проверь ID.",flags:MessageFlags.Ephemeral});return true;}
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ha:punish:timeout:${target}`).setLabel("Тайм-аут 10 мин").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`ha:punish:kick:${target}`).setLabel("Кик").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ha:punish:ban:${target}`).setLabel("Бан").setStyle(ButtonStyle.Danger),
      );
      interaction.client._pendingPunishments ||= new Map();
      interaction.client._pendingPunishments.set(`${interaction.guildId}:${interaction.user.id}`,{target,reason,expires:Date.now()+120000});
      await interaction.reply({content:`Цель: <@${target}>\nПричина: ${reason}\nВыбери действие. Кнопки действуют 2 минуты.`,components:[row],flags:MessageFlags.Ephemeral});return true;
    }
    if (id.startsWith("ha:punish:")) {
      if(!allowed(interaction,"moderation")){await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral});return true;}
      const [, , action,target]=id.split(":");
      const state=interaction.client._pendingPunishments?.get(`${interaction.guildId}:${interaction.user.id}`);
      if(!state||state.target!==target||state.expires<Date.now()){await interaction.reply({content:"Действие истекло. Начни заново.",flags:MessageFlags.Ephemeral});return true;}
      const member=await interaction.guild.members.fetch(target).catch(()=>null);
      if(!member){await interaction.reply({content:"Участник больше не найден.",flags:MessageFlags.Ephemeral});return true;}
      if(member.id===interaction.guild.ownerId||member.id===interaction.client.user.id||member.roles.highest.position>=interaction.member.roles.highest.position){await interaction.reply({content:"⛔ Нельзя применить это наказание из-за иерархии ролей.",flags:MessageFlags.Ephemeral});return true;}
      try{
        if(action==="timeout"){
          if(!member.moderatable)throw new Error("Бот не может выдать тайм-аут: проверь права и иерархию ролей.");
          await member.timeout(10*60*1000,state.reason);
        } else if(action==="kick"){
          if(!member.kickable)throw new Error("Бот не может кикнуть участника: проверь права и иерархию ролей.");
          await member.kick(state.reason);
        } else if(action==="ban"){
          if(!member.bannable)throw new Error("Бот не может забанить участника: проверь права и иерархию ролей.");
          await interaction.guild.members.ban(target,{reason:state.reason});
        } else throw new Error("Неизвестное действие.");
        db.prepare("INSERT INTO moderation_cases(guild_id,target_id,moderator_id,action,reason) VALUES(?,?,?,?,?)").run(interaction.guildId,target,interaction.user.id,action,state.reason);
        audit(interaction.guildId,interaction.user.id,`moderation_${action}`,target,state.reason);
        const settings=db.prepare("SELECT mod_log_channel_id FROM guild_settings WHERE guild_id=?").get(interaction.guildId);
        if(settings?.mod_log_channel_id){
          const channel=await interaction.guild.channels.fetch(settings.mod_log_channel_id).catch(()=>null);
          if(channel?.isTextBased()) await channel.send({embeds:[new EmbedBuilder().setColor(0xed4245).setTitle("🛡️ Действие модерации").addFields({name:"Действие",value:action,inline:true},{name:"Цель",value:`<@${target}>`,inline:true},{name:"Модератор",value:interaction.user.toString(),inline:true},{name:"Причина",value:state.reason}).setTimestamp()]}).catch(()=>{});
        }
        interaction.client._pendingPunishments.delete(`${interaction.guildId}:${interaction.user.id}`);
        await interaction.update({content:`✅ Выполнено: ${action} для <@${target}>.\nПричина: ${state.reason}`,components:[]});
      }catch(error){await interaction.reply({content:`⚠️ ${error.message||"Не удалось выполнить действие."}`,flags:MessageFlags.Ephemeral});}
      return true;
    }
    if (interaction.isModalSubmit() && id === "ha:modal:rpcreate") {
      if(!allowed(interaction,"rp")){await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral});return true;}
      const name=interaction.fields.getTextInputValue("name").trim(), trigger=interaction.fields.getTextInputValue("trigger").trim().toLocaleLowerCase("ru"), response=interaction.fields.getTextInputValue("response").trim();
      const exists=db.prepare("SELECT id FROM rp_actions WHERE guild_id=? AND lower(trigger_text)=lower(?)").get(interaction.guildId,trigger);
      if(exists){await interaction.reply({content:"Такой триггер уже используется. Выбери уникальный.",flags:MessageFlags.Ephemeral});return true;}
      const result=db.prepare("INSERT INTO rp_actions(guild_id,name,trigger_text,response,created_by,is_enabled) VALUES(?,?,?,?,?,1)").run(interaction.guildId,name,trigger,response,interaction.user.id);
      audit(interaction.guildId,interaction.user.id,"rp_action_created",String(result.lastInsertRowid),trigger);
      await interaction.reply({content:`✅ RP-действие «${name}» создано (ID ${result.lastInsertRowid}).`,flags:MessageFlags.Ephemeral});return true;
    }
    if (interaction.isModalSubmit() && id === "ha:modal:rptoggle") {
      if(!allowed(interaction,"rp")){await interaction.reply({content:"⛔ Нет доступа.",flags:MessageFlags.Ephemeral});return true;}
      const value=interaction.fields.getTextInputValue("target_id").trim(), actionId=Number(value);
      if(!Number.isSafeInteger(actionId)||actionId<1){await interaction.reply({content:"Укажи числовой ID RP-действия.",flags:MessageFlags.Ephemeral});return true;}
      const row=db.prepare("SELECT is_enabled,name FROM rp_actions WHERE guild_id=? AND id=?").get(interaction.guildId,actionId);
      if(!row){await interaction.reply({content:"Действие не найдено.",flags:MessageFlags.Ephemeral});return true;}
      db.prepare("UPDATE rp_actions SET is_enabled=? WHERE guild_id=? AND id=?").run(row.is_enabled?0:1,interaction.guildId,actionId);
      audit(interaction.guildId,interaction.user.id,"rp_action_toggled",String(actionId),row.is_enabled?"disabled":"enabled");
      await interaction.reply({content:`✅ «${row.name}»: ${row.is_enabled?"выключено":"включено"}.`,flags:MessageFlags.Ephemeral});return true;
    }
    return true;
  },
};

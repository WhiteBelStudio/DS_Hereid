const { createCanvas, loadImage } = require("@napi-rs/canvas");

const THEMES = {
  "Океан": ["#071a36", "#087eaa", "#71e7f5"],
  "Лес": ["#071f1a", "#147d52", "#8cf0b0"],
  "Закат": ["#35132e", "#c34b54", "#ffc27a"],
  "Неон": ["#130d35", "#672de0", "#5ef5ff"],
  "Галактика": ["#100d2d", "#5536a6", "#f0a7ff"],
  "Золото": ["#211506", "#98651a", "#ffe4a0"],
  "Лёд": ["#0b2037", "#387fba", "#d4f7ff"],
  "Тень": ["#080b14", "#343c54", "#a9b6d4"],
};
const DEFAULT_THEME = ["#101827", "#334b83", "#8ca9ff"];

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitText(ctx, text, maxWidth, startSize, font = "600") {
  let size = startSize;
  do {
    ctx.font = `${font} ${size}px sans-serif`;
    size -= 1;
  } while (ctx.measureText(text).width > maxWidth && size > 16);
  return size;
}

async function renderProfileCard({ user, displayName, title, badge, frame, level, xp, balance, percent, inventoryCount }) {
  const width = 1200;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const palette = THEMES[frame?.value] || DEFAULT_THEME;
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, palette[0]);
  bg.addColorStop(0.58, palette[1]);
  bg.addColorStop(1, palette[0]);
  ctx.fillStyle = bg;
  roundedRect(ctx, 0, 0, width, height, 36);
  ctx.fill();

  // Ambient light and decorative orbits.
  const glow = ctx.createRadialGradient(960, 30, 10, 960, 30, 620);
  glow.addColorStop(0, palette[2] + "55");
  glow.addColorStop(1, palette[2] + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.17;
  ctx.strokeStyle = palette[2];
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(1000, 85, 140 + i * 48, 55 + i * 24, -0.32, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Accent frame.
  ctx.strokeStyle = palette[2];
  ctx.globalAlpha = 0.88;
  ctx.lineWidth = 3;
  roundedRect(ctx, 3, 3, width - 6, height - 6, 34);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Avatar with ring.
  const avatarX = 72, avatarY = 82, avatarSize = 224;
  ctx.save();
  ctx.shadowColor = palette[2];
  ctx.shadowBlur = 32;
  ctx.strokeStyle = palette[2];
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  try {
    const avatar = await loadImage(user.displayAvatarURL({ extension: "png", size: 512 }));
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } catch {
    ctx.fillStyle = "#26334d";
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px sans-serif";
  ctx.fillText("HERADELEGEND  /  MEMBER CARD", 340, 66);
  ctx.fillStyle = palette[2];
  ctx.fillRect(340, 84, 128, 5);

  const safeName = String(displayName || user.username).slice(0, 32);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${fitText(ctx, safeName, 790, 54)}px sans-serif`;
  ctx.fillText(safeName, 340, 154);
  ctx.fillStyle = palette[2];
  ctx.font = "600 27px sans-serif";
  ctx.fillText(`${badge || "🌱"}  ${String(title || "Участник сообщества").slice(0, 34)}`, 342, 202);

  // Progress panel.
  ctx.fillStyle = "rgba(4, 8, 20, 0.42)";
  roundedRect(ctx, 340, 235, 790, 92, 18);
  ctx.fill();
  ctx.fillStyle = "#dce7ff";
  ctx.font = "600 20px sans-serif";
  ctx.fillText(`LEVEL ${level}   •   ${Number(xp).toLocaleString("ru-RU")} XP`, 366, 271);
  ctx.fillStyle = "rgba(255,255,255,0.17)";
  roundedRect(ctx, 366, 288, 735, 14, 7);
  ctx.fill();
  const progressWidth = Math.max(8, 735 * Math.min(100, Math.max(0, percent)) / 100);
  const progressGradient = ctx.createLinearGradient(366, 0, 1101, 0);
  progressGradient.addColorStop(0, palette[1]);
  progressGradient.addColorStop(1, palette[2]);
  ctx.fillStyle = progressGradient;
  roundedRect(ctx, 366, 288, progressWidth, 14, 7);
  ctx.fill();

  const stats = [
    ["🪙", "БАЛАНС", Number(balance).toLocaleString("ru-RU")],
    ["✦", "УРОВЕНЬ", String(level)],
    ["◇", "КОЛЛЕКЦИЯ", String(inventoryCount)],
  ];
  stats.forEach((stat, index) => {
    const x = 340 + index * 268;
    ctx.fillStyle = "rgba(5, 9, 22, 0.45)";
    roundedRect(ctx, x, 352, 246, 82, 15);
    ctx.fill();
    ctx.fillStyle = palette[2];
    ctx.font = "600 17px sans-serif";
    ctx.fillText(stat[1], x + 18, 380);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 25px sans-serif";
    ctx.fillText(`${stat[0]}  ${stat[2]}`, x + 18, 414);
  });

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "500 16px sans-serif";
  ctx.fillText(frame ? `THEME  •  ${String(frame.value).toUpperCase()}` : "THEME  •  CLASSIC", 72, 352);
  ctx.fillStyle = palette[2];
  ctx.font = "700 18px sans-serif";
  ctx.fillText("YOUR PROFILE. YOUR STYLE.", 72, 388);

  return canvas.toBuffer("image/png");
}

module.exports = { renderProfileCard, THEMES };

const { createCanvas, loadImage } = require("@napi-rs/canvas");

const THEMES = {
  "Океан": { colors: ["#03172d", "#087eaa", "#71e7f5"], label: "БЕЗДНА ОКЕАНА", motif: "ocean" },
  "Лес": { colors: ["#061c17", "#147d52", "#8cf0b0"], label: "ИЗУМРУДНАЯ ЧАЩА", motif: "forest" },
  "Закат": { colors: ["#35132e", "#c34b54", "#ffc27a"], label: "ПОСЛЕДНИЙ ЗАКАТ", motif: "sunset" },
  "Неон": { colors: ["#130d35", "#672de0", "#5ef5ff"], label: "НЕОНОВЫЙ ИМПУЛЬС", motif: "neon" },
  "Галактика": { colors: ["#100d2d", "#5536a6", "#f0a7ff"], label: "РОЖДЕНИЕ ГАЛАКТИКИ", motif: "galaxy" },
  "Золото": { colors: ["#211506", "#98651a", "#ffe4a0"], label: "ЗОЛОТАЯ ДИНАСТИЯ", motif: "gold" },
  "Лёд": { colors: ["#0b2037", "#387fba", "#d4f7ff"], label: "КРИСТАЛЬНЫЙ ШТОРМ", motif: "ice" },
  "Тень": { colors: ["#080b14", "#343c54", "#a9b6d4"], label: "ТИХАЯ ТЕНЬ", motif: "shadow" },
};
const DEFAULT_THEME = { colors: ["#101827", "#334b83", "#8ca9ff"], label: "КЛАССИЧЕСКИЙ БАННЕР", motif: "classic" };

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
  return Math.max(16, size);
}
function seeded(seed) {
  let n = 0;
  for (const char of seed) n = (n * 31 + char.charCodeAt(0)) >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
function drawBannerArt(ctx, theme, width, height) {
  const [c1, c2, accent] = theme.colors;
  const random = seeded(theme.motif);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, c1);
  gradient.addColorStop(0.48, c2);
  gradient.addColorStop(1, c1);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.74, height * 0.32, 8, width * 0.74, height * 0.32, width * 0.52);
  glow.addColorStop(0, accent + "aa");
  glow.addColorStop(1, accent + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = accent;
  ctx.fillStyle = accent;
  ctx.lineWidth = 2;
  if (theme.motif === "ocean") {
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(0, height * (0.35 + i * 0.08));
      for (let x = 0; x <= width; x += 30) {
        const y = height * (0.35 + i * 0.08) + Math.sin(x / 65 + i) * (9 + i);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 34; i++) {
      const x = random() * width, y = random() * height;
      ctx.beginPath(); ctx.arc(x, y, 1 + random() * 4, 0, Math.PI * 2); ctx.fill();
    }
  } else if (theme.motif === "forest") {
    for (let i = 0; i < 24; i++) {
      const x = random() * width, h = 30 + random() * 120;
      ctx.beginPath(); ctx.moveTo(x, height); ctx.lineTo(x - h * 0.24, height - h * 0.48); ctx.lineTo(x, height - h); ctx.lineTo(x + h * 0.24, height - h * 0.48); ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 45; i++) { ctx.globalAlpha = random() * 0.55; ctx.beginPath(); ctx.arc(random() * width, random() * height, 1 + random() * 3, 0, Math.PI * 2); ctx.fill(); }
  } else if (theme.motif === "sunset") {
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(width * 0.78, height * 0.4, 78, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 7; i++) {
      ctx.beginPath(); ctx.moveTo(width * 0.48, height * (0.7 + i * 0.045)); ctx.quadraticCurveTo(width * 0.75, height * (0.45 + i * 0.035), width, height * (0.7 + i * 0.045)); ctx.stroke();
    }
  } else if (theme.motif === "neon") {
    ctx.globalAlpha = 0.6;
    for (let i = -4; i < 12; i++) { ctx.beginPath(); ctx.moveTo(width * 0.48 + i * 65, 0); ctx.lineTo(width * 0.25 + i * 65, height); ctx.stroke(); }
    for (let i = 0; i < 8; i++) { ctx.strokeRect(width * 0.55 + i * 18, height * 0.18 + i * 8, 190 - i * 15, 80 - i * 7); }
  } else if (theme.motif === "galaxy") {
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 170; i++) { const x = random() * width, y = random() * height; ctx.beginPath(); ctx.arc(x, y, random() * 2.7 + 0.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.ellipse(width * 0.76, height * 0.46, 45 + i * 28, 14 + i * 10, -0.28, 0, Math.PI * 2); ctx.stroke(); }
  } else if (theme.motif === "gold") {
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(width * (0.52 + i * 0.06), 0); ctx.lineTo(width * (0.3 + i * 0.06), height); ctx.stroke(); }
    for (let i = 0; i < 70; i++) { ctx.beginPath(); ctx.arc(random() * width, random() * height, random() * 2 + 0.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(width * 0.8, height * 0.45, 62, 0, Math.PI * 2); ctx.stroke();
  } else if (theme.motif === "ice") {
    ctx.globalAlpha = 0.65;
    for (let i = 0; i < 18; i++) {
      const x = random() * width, y = random() * height, size = 22 + random() * 72;
      ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size * 0.42, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size * 0.42, y); ctx.closePath(); ctx.stroke();
    }
  } else {
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 13; i++) { ctx.beginPath(); ctx.ellipse(width * 0.76, height * 0.5, 60 + i * 28, 18 + i * 8, -0.5, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 50; i++) { ctx.beginPath(); ctx.arc(random() * width, random() * height, random() * 2 + 0.5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();

  // Contrast overlay makes the banner title readable without hiding the artwork.
  const shade = ctx.createLinearGradient(0, 0, width, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.54)");
  shade.addColorStop(0.48, "rgba(0,0,0,0.12)");
  shade.addColorStop(1, "rgba(0,0,0,0.04)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

async function renderProfileCard({ user, displayName, title, badge, banner, level, xp, balance, percent, inventoryCount }) {
  const width = 1200;
  const height = 600;
  const bannerHeight = 230;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const theme = THEMES[banner?.value] || DEFAULT_THEME;
  const [c1, c2, accent] = theme.colors;

  // Card body and large custom artwork at the TOP of the profile.
  ctx.fillStyle = "#0a1020";
  roundedRect(ctx, 0, 0, width, height, 34);
  ctx.fill();
  ctx.save();
  roundedRect(ctx, 0, 0, width, bannerHeight + 22, 34);
  ctx.clip();
  drawBannerArt(ctx, theme, width, bannerHeight);
  ctx.restore();

  // Top banner heading.
  ctx.fillStyle = accent;
  ctx.font = "700 18px sans-serif";
  ctx.fillText("HERADELEGEND  /  PROFILE BANNER", 46, 48);
  ctx.fillStyle = "#ffffff";
  const bannerTitle = banner ? theme.label : "КЛАССИЧЕСКИЙ БАННЕР";
  ctx.font = `800 ${fitText(ctx, bannerTitle, 760, 40)}px sans-serif`;
  ctx.fillText(bannerTitle, 46, 105);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "500 18px sans-serif";
  ctx.fillText(banner ? "CUSTOM COSMETIC  •  EQUIPPED" : "YOUR PROFILE. YOUR STYLE.", 48, 140);

  // Main profile content begins UNDER the banner.
  const avatarX = 58, avatarY = 258, avatarSize = 150;
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 24;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
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

  const safeName = String(displayName || user.username).slice(0, 32);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${fitText(ctx, safeName, 810, 42)}px sans-serif`;
  ctx.fillText(safeName, 245, 302);
  ctx.fillStyle = accent;
  ctx.font = "600 24px sans-serif";
  ctx.fillText(`${badge || "🌱"}  ${String(title || "Участник сообщества").slice(0, 34)}`, 248, 345);

  // Level and progress panel.
  ctx.fillStyle = "rgba(255,255,255,0.055)";
  roundedRect(ctx, 245, 365, 900, 76, 16);
  ctx.fill();
  ctx.fillStyle = "#dce7ff";
  ctx.font = "600 19px sans-serif";
  ctx.fillText(`LEVEL ${level}   •   ${Number(xp).toLocaleString("ru-RU")} XP`, 268, 395);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundedRect(ctx, 268, 410, 850, 12, 6);
  ctx.fill();
  const progressWidth = Math.max(8, 850 * Math.min(100, Math.max(0, percent)) / 100);
  const progressGradient = ctx.createLinearGradient(268, 0, 1118, 0);
  progressGradient.addColorStop(0, c2);
  progressGradient.addColorStop(1, accent);
  ctx.fillStyle = progressGradient;
  roundedRect(ctx, 268, 410, progressWidth, 12, 6);
  ctx.fill();

  const stats = [
    ["БАЛАНС", `🪙 ${Number(balance).toLocaleString("ru-RU")}`],
    ["УРОВЕНЬ", String(level)],
    ["КОЛЛЕКЦИЯ", String(inventoryCount)],
  ];
  stats.forEach((stat, index) => {
    const x = 58 + index * 375;
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    roundedRect(ctx, x, 465, 350, 92, 16);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = "600 16px sans-serif";
    ctx.fillText(stat[0], x + 20, 493);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 26px sans-serif";
    ctx.fillText(stat[1], x + 20, 531);
  });

  // A crisp colored accent keeps each theme recognizable even on the card body.
  ctx.fillStyle = accent;
  roundedRect(ctx, 58, 573, 1084, 4, 2);
  ctx.fill();
  return canvas.toBuffer("image/png");
}

module.exports = { renderProfileCard, THEMES };

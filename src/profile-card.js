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
  gradient.addColorStop(0.42, c2);
  gradient.addColorStop(1, c1);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Atmospheric light beams and layered glow.
  for (let i = 0; i < 5; i++) {
    const gx = width * (0.48 + i * 0.13);
    const beam = ctx.createLinearGradient(gx, 0, gx - 150, height);
    beam.addColorStop(0, accent + "00");
    beam.addColorStop(0.5, accent + "24");
    beam.addColorStop(1, accent + "00");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(gx - 28, 0);
    ctx.lineTo(gx + 28, 0);
    ctx.lineTo(gx - 100, height);
    ctx.lineTo(gx - 175, height);
    ctx.closePath();
    ctx.fill();
  }
  const glow = ctx.createRadialGradient(width * 0.72, height * 0.38, 4, width * 0.72, height * 0.38, width * 0.65);
  glow.addColorStop(0, accent + "bb");
  glow.addColorStop(0.32, c2 + "77");
  glow.addColorStop(1, accent + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Each named banner gets its own recognizable artwork rather than a generic gradient.
  ctx.save();
  if (theme.motif === "ocean") {
    for (let i = 0; i < 16; i++) {
      ctx.beginPath(); ctx.strokeStyle = i % 2 ? accent + "90" : "#ffffff55"; ctx.lineWidth = 2 + i % 3;
      ctx.moveTo(0, height * (0.3 + i * 0.045));
      for (let x = 0; x <= width; x += 18) ctx.lineTo(x, height * (0.3 + i * 0.045) + Math.sin(x / 72 + i * 0.6) * (12 + i * 1.5));
      ctx.stroke();
    }
    // Glowing underwater shafts and bubbles.
    for (let i = 0; i < 70; i++) { ctx.fillStyle = accent + (i % 3 ? "88" : "cc"); ctx.beginPath(); ctx.arc(random() * width, random() * height, 1 + random() * 3, 0, Math.PI * 2); ctx.fill(); }
  } else if (theme.motif === "forest") {
    for (let i = 0; i < 35; i++) {
      const x = random() * width, h = 40 + random() * 160, w = 18 + random() * 35;
      ctx.fillStyle = i % 2 ? "#03140dcc" : accent + "55";
      ctx.beginPath(); ctx.moveTo(x, height); ctx.lineTo(x - w, height - h * 0.45); ctx.lineTo(x, height - h); ctx.lineTo(x + w, height - h * 0.45); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = accent + "99"; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(random() * width, height); ctx.lineTo(random() * width, 0); ctx.stroke(); }
    for (let i = 0; i < 55; i++) { ctx.fillStyle = "#d8ffd788"; ctx.beginPath(); ctx.arc(random() * width, random() * height, 1 + random() * 2, 0, Math.PI * 2); ctx.fill(); }
  } else if (theme.motif === "sunset") {
    const sun = ctx.createRadialGradient(width * 0.76, height * 0.43, 8, width * 0.76, height * 0.43, 100);
    sun.addColorStop(0, "#fff7ce"); sun.addColorStop(0.35, accent); sun.addColorStop(1, accent + "00");
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(width * 0.76, height * 0.43, 110, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#25102d99"; ctx.beginPath(); ctx.moveTo(0, height); ctx.lineTo(width * 0.18, height * 0.6); ctx.lineTo(width * 0.3, height * 0.77); ctx.lineTo(width * 0.47, height * 0.49); ctx.lineTo(width * 0.68, height); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#190f2dcc"; ctx.beginPath(); ctx.moveTo(width * 0.48, height); ctx.lineTo(width * 0.73, height * 0.62); ctx.lineTo(width * 0.88, height * 0.72); ctx.lineTo(width, height * 0.42); ctx.lineTo(width, height); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 7; i++) { ctx.strokeStyle = "#ffd59b88"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(width * 0.58, height * (0.7 + i * 0.035)); ctx.quadraticCurveTo(width * 0.78, height * (0.55 + i * 0.03), width, height * (0.7 + i * 0.035)); ctx.stroke(); }
  } else if (theme.motif === "neon") {
    ctx.strokeStyle = accent + "aa"; ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) { const x = i * 95 - 100; ctx.beginPath(); ctx.moveTo(x, height); ctx.lineTo(x + 110, height * 0.25); ctx.lineTo(x + 170, height * 0.25); ctx.lineTo(x + 280, height); ctx.stroke(); }
    for (let i = 0; i < 10; i++) { ctx.strokeStyle = i % 2 ? "#ff4fe288" : accent + "bb"; ctx.lineWidth = 2; ctx.strokeRect(width * 0.55 + i * 17, height * 0.15 + i * 6, 210 - i * 22, 105 - i * 10); }
    for (let i = 0; i < 36; i++) { ctx.fillStyle = i % 2 ? "#ff4fe2cc" : accent; ctx.fillRect(random() * width, random() * height, 2 + random() * 4, 2 + random() * 4); }
  } else if (theme.motif === "galaxy") {
    for (let i = 0; i < 230; i++) { ctx.fillStyle = i % 4 ? "#ffffffcc" : accent; ctx.beginPath(); ctx.arc(random() * width, random() * height, random() * 2.3 + 0.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.translate(width * 0.76, height * 0.48); ctx.rotate(-0.32);
    for (let i = 0; i < 12; i++) { ctx.strokeStyle = i % 2 ? accent + "99" : "#ffffff55"; ctx.lineWidth = 2 + i % 2; ctx.beginPath(); ctx.ellipse(0, 0, 28 + i * 25, 8 + i * 8, 0, 0, Math.PI * 2); ctx.stroke(); }
    const core = ctx.createRadialGradient(0, 0, 2, 0, 0, 90); core.addColorStop(0, "#ffffff"); core.addColorStop(0.2, accent); core.addColorStop(1, accent + "00"); ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, 90, 0, Math.PI * 2); ctx.fill();
  } else if (theme.motif === "gold") {
    ctx.strokeStyle = accent + "88"; ctx.lineWidth = 3;
    for (let i = 0; i < 13; i++) { ctx.beginPath(); ctx.moveTo(width * (0.45 + i * 0.055), 0); ctx.lineTo(width * (0.22 + i * 0.06), height); ctx.stroke(); }
    ctx.fillStyle = "#120d08dd"; ctx.beginPath(); ctx.moveTo(width * 0.65, height); ctx.lineTo(width * 0.69, height * 0.38); ctx.lineTo(width * 0.75, height * 0.52); ctx.lineTo(width * 0.81, height * 0.22); ctx.lineTo(width * 0.88, height * 0.5); ctx.lineTo(width * 0.95, height * 0.34); ctx.lineTo(width, height * 0.56); ctx.lineTo(width, height); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 90; i++) { ctx.fillStyle = i % 2 ? "#ffe7aacc" : accent; ctx.beginPath(); ctx.arc(random() * width, random() * height, random() * 2.4 + 0.4, 0, Math.PI * 2); ctx.fill(); }
  } else if (theme.motif === "ice") {
    ctx.strokeStyle = "#e5fbff99"; ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) { const x = random() * width, y = random() * height, s = 25 + random() * 80; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.45, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.45, y); ctx.closePath(); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const x = i * 115 - 30; ctx.strokeStyle = accent + "aa"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 50, height * 0.5); ctx.lineTo(x + 8, height); ctx.stroke(); }
    for (let i = 0; i < 80; i++) { ctx.fillStyle = "#ffffffbb"; ctx.beginPath(); ctx.arc(random() * width, random() * height, random() * 2 + 0.5, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.strokeStyle = accent + "88"; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.ellipse(width * 0.78, height * 0.5, 35 + i * 25, 12 + i * 9, -0.42, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = "#05040b99"; ctx.beginPath(); ctx.moveTo(0, height); ctx.lineTo(width * 0.2, height * 0.48); ctx.lineTo(width * 0.34, height * 0.7); ctx.lineTo(width * 0.49, height * 0.38); ctx.lineTo(width * 0.62, height); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ff274499"; ctx.beginPath(); ctx.arc(width * 0.78, height * 0.36, 58, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 65; i++) { ctx.fillStyle = i % 2 ? "#ff465e" : accent; ctx.beginPath(); ctx.arc(random() * width, random() * height, random() * 2 + 0.4, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();

  // Keep typography readable over detailed art.
  const shade = ctx.createLinearGradient(0, 0, width, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.68)");
  shade.addColorStop(0.45, "rgba(0,0,0,0.28)");
  shade.addColorStop(1, "rgba(0,0,0,0.02)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

async function renderProfileCard({ user, displayName, title, badge, banner, level, xp, balance, percent, inventoryCount }) {
  const width = 1200;
  const height = 700;
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
  // Level and progress panel comes before the title.
  ctx.fillStyle = "rgba(255,255,255,0.055)";
  roundedRect(ctx, 245, 335, 900, 86, 16);
  ctx.fill();
  ctx.fillStyle = "#dce7ff";
  ctx.font = "600 19px sans-serif";
  ctx.fillText(`УРОВЕНЬ ${level}   •   ${Number(xp).toLocaleString("ru-RU")} XP`, 268, 369);
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundedRect(ctx, 268, 387, 850, 12, 6);
  ctx.fill();
  const progressWidth = Math.max(8, 850 * Math.min(100, Math.max(0, percent)) / 100);
  const progressGradient = ctx.createLinearGradient(268, 0, 1118, 0);
  progressGradient.addColorStop(0, c2);
  progressGradient.addColorStop(1, accent);
  ctx.fillStyle = progressGradient;
  roundedRect(ctx, 268, 387, progressWidth, 12, 6);
  ctx.fill();

  const stats = [
    ["БАЛАНС", `🪙 ${Number(balance).toLocaleString("ru-RU")}`],
    ["УРОВЕНЬ", String(level)],
    ["КОЛЛЕКЦИЯ", String(inventoryCount)],
  ];
  stats.forEach((stat, index) => {
    const x = 58 + index * 375;
    ctx.fillStyle = "rgba(255,255,255,0.055)";
    roundedRect(ctx, x, 445, 350, 92, 16);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = "600 16px sans-serif";
    ctx.fillText(stat[0], x + 20, 473);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 26px sans-serif";
    ctx.fillText(stat[1], x + 20, 511);
  });

  // Show the custom title last, after the key profile stats.
  ctx.fillStyle = "rgba(255,255,255,0.055)";
  roundedRect(ctx, 58, 560, 1084, 92, 16);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = "600 16px sans-serif";
  ctx.fillText("ТИТУЛ УЧАСТНИКА", 80, 588);
  ctx.fillStyle = "#ffffff";
  const titleText = `${badge || "🌱"}  ${String(title || "Участник сообщества").slice(0, 34)}`;
  ctx.font = `700 ${fitText(ctx, titleText, 1020, 28)}px sans-serif`;
  ctx.fillText(titleText, 80, 625);

  // A crisp colored accent keeps each theme recognizable even on the card body.
  ctx.fillStyle = accent;
  roundedRect(ctx, 58, 675, 1084, 4, 2);
  ctx.fill();
  return canvas.toBuffer("image/png");
}

module.exports = { renderProfileCard, THEMES };

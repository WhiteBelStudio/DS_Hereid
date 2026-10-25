const assert = require("node:assert/strict");
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "herade-member-profile-"));
process.env.DATABASE_PATH = path.join(tempDir, "profile.sqlite"); process.env.DISCORD_TOKEN = "test-token"; process.env.CLIENT_ID = "12345678901234567"; process.env.GUILD_ID = "12345678901234568"; process.env.LOG_LEVEL = "error";
const db = require("../src/database");
const { MESSAGE_XP, XP_COOLDOWN_MS, levelForXp, getProfile, addMessageXp, changeXp } = require("../src/member-profile");
let passed = 0; function test(name, fn) { fn(); passed++; console.log(`[ OK ] ${name}`); }
try {
 test("level boundaries", () => { assert.equal(levelForXp(0),0); assert.equal(levelForXp(99),0); assert.equal(levelForXp(100),1); assert.equal(levelForXp(400),2); });
 test("missing profile defaults without writing", () => { assert.equal(getProfile(process.env.GUILD_ID,"12345678901234569").xp,0); assert.equal(db.prepare("SELECT COUNT(*) n FROM member_stats").get().n,0); });
 test("message XP persists and respects cooldown", () => { const g=process.env.GUILD_ID,u="12345678901234569"; assert.equal(addMessageXp(g,u,100000).awarded,true); assert.equal(addMessageXp(g,u,100000+XP_COOLDOWN_MS-1).awarded,false); assert.equal(addMessageXp(g,u,100000+XP_COOLDOWN_MS).xp,MESSAGE_XP*2); });
 test("manual XP recalculates level and clamps at zero", () => { const g=process.env.GUILD_ID,u="12345678901234569"; assert.equal(changeXp(g,u,400).level,2); assert.equal(changeXp(g,u,-9999).xp,0); });
 test("XP changes preserve existing balance", () => { const g=process.env.GUILD_ID,u="12345678901234569"; db.prepare("UPDATE member_stats SET balance=777 WHERE guild_id=? AND user_id=?").run(g,u); changeXp(g,u,250); assert.equal(getProfile(g,u).balance,777); });
 db.close(); console.log(`[test-member-profile] Passed: ${passed}`);
} catch (error) { console.error("[test-member-profile] Failed:",error); try { db.close(); } catch {} process.exitCode=1; } finally { fs.rmSync(tempDir,{recursive:true,force:true}); }

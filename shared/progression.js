// XP, levels and match reward formulas.

export const MAX_LEVEL = 100;

export function xpForLevel(level) {
  // XP needed to go from `level` to `level + 1`
  return 900 + 140 * (level - 1);
}

export function levelFromXp(totalXp) {
  let level = 1;
  let rem = totalXp;
  while (level < MAX_LEVEL && rem >= xpForLevel(level)) {
    rem -= xpForLevel(level);
    level++;
  }
  return { level, into: rem, needed: level >= MAX_LEVEL ? 0 : xpForLevel(level) };
}

export function levelUpReward(level) {
  return level % 5 === 0 ? 500 : 120;
}

export const DAILY_REWARDS = [100, 150, 200, 250, 350, 450, 800];

export const REWARD = {
  completion: 120,
  perKill: 12,
  perBotKill: 6,
  perAssist: 5,
  perHeadshot: 3,
  win: 150,
  ffaPlace: [180, 110, 60],
  privateMul: 0.5,
  xpCompletion: 250,
  xpKill: 60,
  xpBotKill: 30,
  xpAssist: 20,
  xpHeadshot: 10,
  xpWin: 350,
  maxCreditsPerMatch: 1200,
};

/**
 * Computes credits + XP for a finished match.
 * stats: { kills, botKills, assists, headshots, won, place, completed }
 */
export function computeMatchRewards(stats, { mode, isPrivate }) {
  const humanKills = Math.max(0, stats.kills - stats.botKills);
  const lines = [];
  let credits = 0;
  let xp = 0;
  if (stats.completed) {
    credits += REWARD.completion; xp += REWARD.xpCompletion;
    lines.push({ label: 'MATCH COMPLETE', credits: REWARD.completion });
  }
  if (humanKills > 0) {
    const c = humanKills * REWARD.perKill; credits += c; xp += humanKills * REWARD.xpKill;
    lines.push({ label: `ELIMINATIONS ×${humanKills}`, credits: c });
  }
  if (stats.botKills > 0) {
    const c = stats.botKills * REWARD.perBotKill; credits += c; xp += stats.botKills * REWARD.xpBotKill;
    lines.push({ label: `BOT ELIMINATIONS ×${stats.botKills}`, credits: c });
  }
  if (stats.assists > 0) {
    const c = stats.assists * REWARD.perAssist; credits += c; xp += stats.assists * REWARD.xpAssist;
    lines.push({ label: `ASSISTS ×${stats.assists}`, credits: c });
  }
  if (stats.headshots > 0) {
    const c = stats.headshots * REWARD.perHeadshot; credits += c; xp += stats.headshots * REWARD.xpHeadshot;
    lines.push({ label: `HEADSHOTS ×${stats.headshots}`, credits: c });
  }
  if (stats.completed) {
    if (mode === 'tdm' && stats.won) {
      credits += REWARD.win; xp += REWARD.xpWin;
      lines.push({ label: 'VICTORY BONUS', credits: REWARD.win });
    } else if (mode === 'ffa' && stats.place >= 1 && stats.place <= 3) {
      const c = REWARD.ffaPlace[stats.place - 1]; credits += c; xp += Math.round(REWARD.xpWin * (c / REWARD.ffaPlace[0]));
      lines.push({ label: `PLACED #${stats.place}`, credits: c });
    }
  }
  if (isPrivate) {
    credits = Math.round(credits * REWARD.privateMul);
    xp = Math.round(xp * REWARD.privateMul);
    lines.push({ label: 'PRIVATE MATCH ×0.5', credits: 0 });
  }
  credits = Math.min(credits, REWARD.maxCreditsPerMatch);
  return { credits, xp, lines };
}

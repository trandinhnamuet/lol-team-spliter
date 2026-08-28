import type { ResolvedPlayer, TeamResult } from "./types";

export const DEFAULT_TEAM_SIZE = 5;

function teamSum(team: ResolvedPlayer[]): number {
  return team.reduce((s, p) => s + (p.elo ?? 0), 0);
}

function spreadOf(teams: ResolvedPlayer[][]): number {
  const sums = teams.map(teamSum);
  return Math.max(...sums) - Math.min(...sums);
}

/** Hàm mục tiêu cho local search: tổng bình phương độ lệch so với trung bình.
 *  Mượt hơn max-min nên ít kẹt ở cực trị địa phương hơn. */
function costOf(teams: ResolvedPlayer[][]): number {
  const sums = teams.map(teamSum);
  const mean = sums.reduce((a, b) => a + b, 0) / sums.length;
  return sums.reduce((acc, s) => acc + (s - mean) * (s - mean), 0);
}

function snakeDraft(players: ResolvedPlayer[], numTeams: number): ResolvedPlayer[][] {
  const teams: ResolvedPlayer[][] = Array.from({ length: numTeams }, () => []);
  let dir = 1;
  let t = 0;
  for (const p of players) {
    teams[t].push(p);
    t += dir;
    if (t === numTeams || t === -1) {
      dir = -dir;
      t += dir;
    }
  }
  return teams;
}

/** Local search: thử hoán đổi mọi cặp người chơi khác team đến khi hết cải thiện. */
function optimize(teams: ResolvedPlayer[][]): ResolvedPlayer[][] {
  const numTeams = teams.length;
  let improved = true;
  let guard = 0;
  while (improved && guard < 1000) {
    improved = false;
    guard++;
    for (let a = 0; a < numTeams; a++) {
      for (let b = a + 1; b < numTeams; b++) {
        for (let i = 0; i < teams[a].length; i++) {
          for (let j = 0; j < teams[b].length; j++) {
            const before = costOf(teams);
            [teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]];
            if (costOf(teams) < before) {
              improved = true;
            } else {
              [teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]];
            }
          }
        }
      }
    }
  }
  return teams;
}

/**
 * Chia danh sách thành các team `teamSize` người sao cho tổng elo chênh lệch ít nhất.
 * - Số team = floor(n / teamSize); nếu n < 2*teamSize thì vẫn chia 2 team đều nhau
 *   để dùng được với ít người.
 * - Người dư (elo thấp nhất) được ghép vào các team có sẵn làm dự bị, mỗi team
 *   tối đa 1 người (dự bị mạnh nhất vào team yếu nhất). Dư nữa thì vào bench.
 * - Dự bị không tính vào tổng elo của team.
 * Thuật toán: snake draft khởi tạo, sau đó local search hoán đổi cặp
 * người chơi giữa các team đến khi không giảm được chênh lệch nữa.
 */
export function balanceTeams(players: ResolvedPlayer[], teamSize = DEFAULT_TEAM_SIZE): TeamResult {
  const sorted = [...players].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
  const n = sorted.length;
  const size = Math.min(Math.max(Math.floor(teamSize) || DEFAULT_TEAM_SIZE, 1), 20);

  // Số team và cỡ team thực dùng: đủ người thì đúng teamSize,
  // ít người thì 2 team đều nhau.
  let numTeams: number;
  let effSize: number;
  if (n >= 2 * size) {
    numTeams = Math.floor(n / size);
    effSize = size;
  } else {
    numTeams = 2;
    effSize = Math.floor(n / 2);
  }

  const starters = sorted.slice(0, numTeams * effSize);
  const leftovers = sorted.slice(numTeams * effSize); // elo thấp nhất làm dự bị

  // Nhiều lần khởi tạo (snake draft + xáo trộn) rồi local search, giữ kết quả tốt nhất.
  let teams = optimize(snakeDraft(starters, numTeams));
  let rng = 12345;
  const nextRand = () => (rng = (rng * 48271) % 2147483647) / 2147483647;
  for (let restart = 0; restart < 15; restart++) {
    const shuffled = [...starters];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(nextRand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const candidate = optimize(snakeDraft(shuffled, numTeams));
    if (spreadOf(candidate) < spreadOf(teams)) teams = candidate;
    if (spreadOf(teams) === 0) break;
  }

  const built: TeamResult["teams"] = teams.map((players) => ({
    players: [...players].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0)),
    totalElo: teamSum(players),
  }));

  // Ghép người dư làm dự bị: dự bị mạnh nhất vào team có tổng elo thấp nhất.
  const byWeakest = built
    .map((t, i) => ({ i, totalElo: t.totalElo }))
    .sort((a, b) => a.totalElo - b.totalElo);
  const reserves = leftovers.slice(0, numTeams);
  reserves.forEach((p, idx) => {
    built[byWeakest[idx].i].reserve = p;
  });

  return {
    teams: built,
    bench: leftovers.slice(numTeams),
    spread: spreadOf(teams),
    teamSize: effSize,
  };
}

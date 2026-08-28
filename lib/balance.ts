import type { ResolvedPlayer, TeamResult } from "./types";

const TEAM_SIZE = 5;

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
 * Chia danh sách thành các team 5 người sao cho tổng elo chênh lệch ít nhất.
 * - Số team = floor(n / 5); người dư (elo thấp nhất) vào danh sách dự bị.
 * - Nếu n < 10 thì chia làm 2 team đều nhau để vẫn dùng được.
 * Thuật toán: snake draft khởi tạo, sau đó local search hoán đổi cặp
 * người chơi giữa các team đến khi không giảm được chênh lệch nữa.
 */
export function balanceTeams(players: ResolvedPlayer[]): TeamResult {
  const sorted = [...players].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
  const n = sorted.length;

  let numTeams: number;
  let bench: ResolvedPlayer[] = [];
  let active: ResolvedPlayer[];

  if (n >= 2 * TEAM_SIZE) {
    numTeams = Math.floor(n / TEAM_SIZE);
    const cut = numTeams * TEAM_SIZE;
    active = sorted.slice(0, cut);
    bench = sorted.slice(cut); // người dư elo thấp nhất làm dự bị
  } else {
    numTeams = 2;
    active = sorted;
  }

  // Nhiều lần khởi tạo (snake draft + xáo trộn) rồi local search, giữ kết quả tốt nhất.
  let teams = optimize(snakeDraft(active, numTeams));
  let rng = 12345;
  const nextRand = () => (rng = (rng * 48271) % 2147483647) / 2147483647;
  for (let restart = 0; restart < 15; restart++) {
    const shuffled = [...active];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(nextRand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const candidate = optimize(snakeDraft(shuffled, numTeams));
    if (spreadOf(candidate) < spreadOf(teams)) teams = candidate;
    if (spreadOf(teams) === 0) break;
  }

  return {
    teams: teams.map((players) => ({
      players: [...players].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0)),
      totalElo: teamSum(players),
    })),
    bench,
    spread: spreadOf(teams),
  };
}

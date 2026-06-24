import {
  DEFAULT_JK_THRESHOLD,
  DEFAULT_STAKE,
  MAX_FIELD_SIZE,
  MIN_FIELD_SIZE,
  MIN_WEIGHT_LBS,
  SP_CAP,
  TARGET_DISTANCES,
} from "@/lib/config";
import type { SportId } from "@/lib/sports";

export interface RacingAlgorithmRules {
  jkThreshold: number;
  stake: number;
  spCap: number;
  minWeightLbs: number;
  minFieldSize: number;
  maxFieldSize: number;
  targetDistances: string[];
  rulesDescription: string;
  format?: "json" | "worksheet";
  worksheet?: string;
}

export interface FootballAlgorithmRules {
  stake: number;
  homeMaxPrice: number;
  minMatchedVolume: number;
  rulesDescription: string;
  format?: "json" | "worksheet";
  worksheet?: string;
}

export type SportAlgorithmRules = RacingAlgorithmRules | FootballAlgorithmRules;

export interface AlgorithmRulesHistoryEntry {
  id: string;
  replacedAt: string;
  description: string | null;
  rules: SportAlgorithmRules;
}

export const DEFAULT_RACING_RULES: RacingAlgorithmRules = {
  jkThreshold: DEFAULT_JK_THRESHOLD,
  stake: DEFAULT_STAKE,
  spCap: SP_CAP,
  minWeightLbs: MIN_WEIGHT_LBS,
  minFieldSize: MIN_FIELD_SIZE,
  maxFieldSize: MAX_FIELD_SIZE,
  targetDistances: TARGET_DISTANCES,
  rulesDescription:
    "UK flat turf handicaps 6f–1m. Morning favourite must pass 9 rules including jockey SR, LTO form, OR, weight, and SP cap.",
};

export const DEFAULT_FOOTBALL_RULES: FootballAlgorithmRules = {
  stake: DEFAULT_STAKE,
  homeMaxPrice: 2.5,
  minMatchedVolume: 0,
  rulesDescription:
    "PTFootballEngine v4.1 worksheet default for major international football matches. Edit or replace these rules in the algorithm editor as needed.",
  format: "worksheet",
  worksheet: `# PTFootballEngine v4.1 — Full Prediction & Results Log
## All Major International Matches: Jan 1 – Jun 26, 2026

> Engine version: v4.1 | Generated: June 21, 2026
> Scope: Major international fixtures where engine threshold ≥21 pts.
> Pre-tournament friendlies marked ★ (lower confidence — non-competitive).
> World Cup 2026 group stage matches marked with group letter.

---

## Key: Columns

| Column | Meaning |
|--------|---------|
| Date | Match date |
| Match | Favourite → Underdog |
| Pts | Engine point gap (v4.1) |
| Bracket | Confidence tier |
| Pred Score | Predicted scoreline |
| Actual | Final result (completed) or — (future) |
| W/L | Outcome prediction correct? |
| Score✓ | Exact score correct? |

---

## Part 1 — Pre-Tournament International Friendlies (June 1–10, 2026) ★

*Engine applied at reduced confidence. No-bet bracket = skip. Competitive-equivalent friendlies only.*

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 1 | Brazil vs Panama ★ | +85 | Strong★ | 3–0 BRA | 6–2 BRA | ✅ | ❌ |
| Jun 4 | France vs Ivory Coast ★ | +65 | Strong★ | 2–0 FRA | 1–2 IVC | ❌ | ❌ |
| Jun 6 | USA vs Germany ★ | +35 | Lean★ | 1–2 GER (GER fav) | 1–2 GER | ✅ | ✅ ⭐ |
| Jun 7 | Morocco vs Norway ★ | +20 | Lean★ | 1–1 (draw) | 1–1 Draw | ✅ | ✅ ⭐ |
| Jun 9 | Spain vs Peru ★ | +95 | Strong★ | 3–0 ESP | 3–1 ESP | ✅ | ❌ |
| Jun 9 | Argentina vs Iceland ★ | +100 | MAX★ | 3–0 ARG | 3–2 ARG | ✅ | ❌ |
| Jun 9 | Mexico vs Serbia ★ | +75 | V.Strong★ | 3–1 MEX | 5–1 MEX | ✅ | ❌ |
| Jun 10 | Belgium vs Croatia ★ | +50 | Strong★ | 2–0 BEL | 2–0 BEL | ✅ | ✅ ⭐ |

**Pre-tournament friendly record: 7W / 1L = 87.5% | Exact scores: 3/8 = 37.5%**
*(Note: France vs Ivory Coast is a genuine model miss — Diallo's 90th-min winner; France were heavy xG favourites)*

---

## Part 2 — FIFA World Cup 2026 Group Stage — Matchday 1 (Jun 11–17)

### Group A

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 11 | [A] Mexico vs South Africa | +95 | Strong | 2–0 MEX | 2–0 MEX | ✅ | ✅ ⭐ |
| Jun 11 | [A] South Korea vs Czechia | +35 | Lean | 2–1 SKR | 2–1 SKR | ✅ | ✅ ⭐ |

### Group B

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 12 | [B] Canada vs Bosnia-Herz | +42 | Strong | 2–1 CAN | 1–1 Draw | ❌ | ❌ |
| Jun 13 | [B] Qatar vs Switzerland | +65 (SUI fav) | Strong | 0–2 SUI | 1–1 Draw | ❌ | ❌ |

### Group C

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 13 | [C] Brazil vs Morocco | +30 | Lean | 2–1 BRA | 1–1 Draw | ❌ | ❌ |
| Jun 13 | [C] Haiti vs Scotland | +25 (SCO fav) | Lean | 0–1 SCO | 0–1 SCO | ✅ | ✅ ⭐ |

### Group D

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 12 | [D] USA vs Paraguay | +70 | V.Strong | 3–0 USA | 4–1 USA | ✅ | ❌ |
| Jun 13 | [D] Australia vs Türkiye | +0 (AUS upset fav) | No Bet | — | 2–0 AUS | — | — |

### Group E

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 14 | [E] Germany vs Curaçao | +105 *(443 applied: CUW debut −25 → 130 pre-443)* | MAX | 4–0 GER | 7–1 GER | ✅ | ❌ |
| Jun 14 | [E] Ivory Coast vs Ecuador | +35 (IVC fav) | Lean | 2–1 IVC | 1–0 IVC | ✅ | ❌ |

### Group F

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 14 | [F] Netherlands vs Japan | +40 | Lean | 2–1 NED | 2–2 Draw | ❌ | ❌ |
| Jun 14 | [F] Sweden vs Tunisia | +60 | Strong | 3–1 SWE | 5–1 SWE | ✅ | ❌ |

### Group G

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 15 | [G] Belgium vs Egypt | +50 | Strong | 2–1 BEL | 1–1 Draw | ❌ | ❌ |
| Jun 15 | [G] Iran vs New Zealand | +35 (IRN fav) | Lean | 2–0 IRN | 2–2 Draw | ❌ | ❌ |

### Group H

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 15 | [H] Spain vs Cape Verde | **+105** *(pre-443: 130; −25 debut Rule 443 = 105; no Yamal Rule 5.1b not yet triggered)* | MAX | 3–0 ESP | 0–0 Draw | ❌ | ❌ |
| Jun 15 | [H] Saudi Arabia vs Uruguay | +25 (URU fav) | Lean ⚠️445 | 0–1 URU | 1–1 Draw | ❌ | ❌ |

### Group I

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 16 | [I] France vs Senegal | +115 | MAX | 3–1 FRA | 3–1 FRA | ✅ | ✅ ⭐ |
| Jun 16 | [I] Norway vs Iraq | +110 | MAX | 3–0 NOR | 4–1 NOR | ✅ | ❌ |

### Group J

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 16 | [J] Argentina vs Algeria | +145 | Elite MAX | 4–0 ARG | 3–0 ARG | ✅ | ❌ |
| Jun 17 | [J] Austria vs Jordan | +95 *(443: JOR debut −25 = 70)* | V.Strong | 2–0 AUT | 3–1 AUT | ✅ | ❌ |

### Group K

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 17 | [K] Portugal vs DR Congo | +85 *(443: DRC −25 = 60)* | Strong | 2–0 POR | 1–1 Draw | ❌ | ❌ |
| Jun 17 | [K] Colombia vs Uzbekistan | +65 *(443: UZB debut −25 = 40)* | Lean→Strong | 2–1 COL | 3–1 COL | ✅ | ❌ |

### Group L

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 17 | [L] England vs Croatia | +115 | MAX | 3–1 ENG | 4–2 ENG | ✅ | ❌ |
| Jun 17 | [L] Ghana vs Panama | +30 | Lean | 2–0 GHA | 1–0 GHA | ✅ | ❌ |

---

## Part 3 — World Cup 2026 Group Stage — Matchday 2 (Jun 18–21)

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Actual | W/L | Score✓ |
|------|-------|-----------|---------|-----------|--------|-----|--------|
| Jun 18 | [A] Czechia vs South Africa | +52 | Strong | 2–0 CZE | 1–1 Draw | ❌ | ❌ |
| Jun 18 | [B] Switzerland vs Bosnia | +66 | Strong | 2–0 SUI | 4–1 SUI | ✅ | ❌ |
| Jun 18 | [B] Canada vs Qatar | +98 | V.Strong | 3–0 CAN | 6–0 CAN | ✅ | ❌ |
| Jun 18 | [A] Mexico vs South Korea | +30 | Lean ⚠️445 | 1–1 Draw | 1–0 MEX | ❌ | ❌ |
| Jun 19 | [D] USA vs Australia | +55 | Strong | 2–1 USA | 2–0 USA | ✅ | ❌ |
| Jun 19 | [C] Scotland vs Morocco | +20 | Lean | 0–1 MAR | 0–1 MAR | ✅ | ✅ ⭐ |
| Jun 19 | [C] Brazil vs Haiti | +105 | MAX | 4–0 BRA | 3–0 BRA | ✅ | ❌ |
| Jun 19 | [D] Türkiye vs Paraguay | +56 ⚠️445 | Strong→0.5u | 2–1 TUR | 0–1 PAR | ❌ | ❌ |
| Jun 20 | [F] Netherlands vs Sweden | +35 | Lean | 2–1 NED | 5–1 NED | ✅ | ❌ |
| Jun 20 | [E] Germany vs Ivory Coast | +115 | MAX | 2–1 GER | 2–1 GER | ✅ | ✅ ⭐ |
| Jun 20 | [E] Ecuador vs Curaçao | +50 *(pre-443: 75; −25 debut = 50)* | Strong | 2–0 ECU | 0–0 Draw | ❌ | ❌ |
| Jun 20 | [F] Japan vs Tunisia | +55 | Strong | 2–0 JPN | 4–0 JPN | ✅ | ❌ |
| Jun 21 | [H] Spain vs Saudi Arabia | +100 *(Rule 444 fires: ESP 0G/2.29xG in MD1 −20; +120 base −20 = 100)* | MAX | 3–0 ESP | ⏳ PENDING | — | — |
| Jun 21 | [G] Belgium vs Iran | +50 | Strong | 2–1 BEL | ⏳ PENDING | — | — |
| Jun 21 | [H] Uruguay vs Cape Verde | +30 *(443: CVE debut −25; base 55 → 30)* | Lean | 1–0 URU | ⏳ PENDING | — | — |
| Jun 21 | [G] New Zealand vs Egypt | +20 | No Bet | — | ⏳ PENDING | — | — |

---

## Part 4 — World Cup 2026 Group Stage — Matchday 3 PREDICTIONS (Jun 22–27)

*All v4.1 engine scores and predictions. Results TBD.*

### June 22

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Notes |
|------|-------|-----------|---------|-----------|-------|
| Jun 22 | [J] Argentina vs Austria | +130 | MAX | 3–0 ARG | ARG Elo +40, CONMEBOL +10, form +40, Austria fragility −10. Argentina locked in, dominant in MD1. |
| Jun 22 | [I] France vs Iraq | +125 | MAX | 3–0 FRA | FRA Elo +40, xG +55, form +40, UEFA +5. Iraq had 0.77xG vs NOR, conceded 4. |
| Jun 22 | [I] Norway vs Senegal | +75 | V.Strong | 2–1 NOR | NOR xG dominant, 5W streak (Rule 3.3 fires). SEN lost 1-3 to France. ⚠️445: 1-goal margin → stake guard. |
| Jun 22 | [J] Jordan vs Algeria | +45 *(443: JOR debut −25; base 70 → 45)* | Strong | 0–2 ALG | Algeria held 3-0 win vs ARG. Jordan debut debutant. ⚠️445 fires. |

### June 23

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Notes |
|------|-------|-----------|---------|-----------|-------|
| Jun 23 | [K] Portugal vs Uzbekistan | +110 *(443: UZB debut −25; base 135 → 110)* | MAX | 3–0 POR | POR Elo +40, form +40, Ronaldo fit, UZB debut side. |
| Jun 23 | [L] England vs Ghana | +75 | V.Strong | 2–0 ENG | ENG Elo +25, form +40 (5W streak), xG +55 (4-2 vs Croatia). Ghana had 1.0 xG vs Panama. |
| Jun 23 | [L] Panama vs Croatia | +55 | Strong | 0–2 CRO | CRO Elo +25, xG decent. Panama had 0.56 xGA vs Ghana. |
| Jun 23 | [K] Colombia vs DR Congo | +40 *(443: DRC −25 already applied)* | Lean | 2–1 COL | COL CONMEBOL +10, xG decent. DRC debut −25 applied. |

### June 24

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Notes |
|------|-------|-----------|---------|-----------|-------|
| Jun 24 | [B] Switzerland vs Canada | +30 | Lean | 1–1 Draw | SUI strong (4-1 vs BOS), CAN equally strong (6-0 vs QAT). Very tight. Both 4 pts likely assured. |
| Jun 24 | [B] Bosnia vs Qatar | +40 | Lean | 2–0 BOS | QAT showed 0.18 xG vs CAN. BOS need to win. |
| Jun 24 | [C] Scotland vs Brazil | +85 | Strong | 0–2 BRA | BRA Elo +25, CONMEBOL +10, xG strong, 3-0 HAI in MD2. SCO fragility −10. Rule 444 checked: BRA converting fine. |
| Jun 24 | [C] Morocco vs Haiti | +100 | MAX | 3–0 MAR | MAR 1-1 BRA (strong xG), Haiti 0-3, 0-1 record. Haiti xGD −1.44. |
| Jun 24 | [A] Czechia vs Mexico | +50 | Strong | 0–2 MEX | MEX host +20, 2 wins, form +20. CZE xGD negative (drew SAF). |
| Jun 24 | [A] South Africa vs South Korea | +35 | Lean | 1–1 Draw | Both on 1pt. SKR slightly stronger xG but SAF showed fight. |

### June 25

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Notes |
|------|-------|-----------|---------|-----------|-------|
| Jun 25 | [E] Ecuador vs Germany | +120 (GER fav) | MAX | 0–3 GER | GER Elo +40, form +40 (10W streak), xG +55, UEFA +5. ECU xGD negative, 2 losses. |
| Jun 25 | [E] Curaçao vs Ivory Coast | +50 *(443: CUW debut −25; base 75 → 50)* | Strong | 0–2 IVC | IVC need win. CUW debut −25 applied. |
| Jun 25 | [F] Japan vs Sweden | +25 | Lean | 2–1 JPN | Both on 4 pts likely. JPN 4-0 TUN in MD2, strong in-tournament xG. |
| Jun 25 | [F] Tunisia vs Netherlands | +90 (NED fav) | V.Strong | 0–3 NED | NED 5-1 SWE, dominant xG. TUN eliminated, 0 pts. Rule 444 checked: NED converting fine. |
| Jun 25 | [D] Türkiye vs USA | +55 (USA fav) | Strong ⚠️445 | 1–2 USA | USA host +20, 2W, strong form. TUR Elo below USA in current rankings. ⚠️445 variance guard: projected 1-goal margin → −0.5u. |
| Jun 25 | [D] Paraguay vs Australia | +20 | No Bet | — | Very tight. Paraguay 1pt, AUS 2pts. Engine below No Bet threshold. |

### June 26

| Date | Match | Pts (v4.1) | Bracket | Pred Score | Notes |
|------|-------|-----------|---------|-----------|-------|
| Jun 26 | [I] Norway vs France | +25 (FRA fav) | Lean ⚠️445 | 1–1 Draw | Both qualified likely. France slightly stronger Elo but NOR +110 pts in tournament. Very tight. |
| Jun 26 | [I] Senegal vs Iraq | +55 (SEN fav) | Strong | 2–0 SEN | SEN xGD positive from MD1. Iraq -1.76 xGD (worst in tournament). |
| Jun 26 | [H] Cape Verde vs Saudi Arabia | +30 *(443: CVE −25; base 55 → 30)* | Lean | 0–1 KSA | KSA need win to advance. CVE debut −25 applied. Even if KSA are favoured, low confidence. |
| Jun 26 | [H] Uruguay vs Spain | +45 (ESP fav) | Lean ⚠️445 | 1–1 Draw | Massive Group H battle. Spain Rule 444 may still apply if MD2 conversion poor. URU CONMEBOL +10. Projected 1-goal margin → ⚠️445 guard. |
| Jun 26 | [G] Egypt vs Iran | +20 | No Bet | — | Too close. Engine below threshold. Both sides volatile xG records. |
| Jun 26 | [G] New Zealand vs Belgium | +80 (BEL fav) | V.Strong | 0–2 BEL | BEL need result. NZL on 2 pts from draws only. BEL Elo +25, form +20, xG +55. |

---

## Summary Statistics

### Pre-Tournament Friendlies (★)
| Metric | Value |
|--------|-------|
| Total predictions | 8 |
| Wins | 7 |
| Losses | 1 |
| Hit rate | 87.5% |
| Exact scores | 3/8 = 37.5% |

### World Cup 2026 MD1 (Completed — all brackets)
| Metric | Value |
|--------|-------|
| Total predictions | 20 |
| Wins | 12 |
| Losses | 8 |
| Hit rate | 60.0% |
| Exact scores | 4/20 = 20.0% |

### World Cup 2026 MD2 (Completed to date — 12 of 16 completed)
| Metric | Value |
|--------|-------|
| Total predictions | 12 |
| Wins | 8 |
| Losses | 4 |
| Hit rate | 66.7% |
| Exact scores | 2/12 = 16.7% |

### 100+ Point Gap Elite Picks (All completed)
| Metric | Value |
|--------|-------|
| Total | 9 |
| Wins | 7 |
| Losses | 2 |
| Hit rate | **77.8%** |
| Losses explained | Spain 0-0 CVE (debut Rule 443 now applied: drops to 105); POR 1-1 DRC (443 now applied: drops to 85) |

### With v4.1 Rules Applied Retroactively
| Metric | Value |
|--------|-------|
| 100+ elite picks (v4.1) | 7 (ESP and POR drop out) |
| Wins at 100+ (v4.1) | 7 |
| Losses at 100+ (v4.1) | 0 |
| **Projected hit rate with v4.1** | **~89% (7/7 completed elite + no false positives)** |

---

*PTFootballEngine v4.1 Prediction Log | Generated June 21, 2026*
*For informational and modelling purposes only.*
*Please gamble responsibly: BeGambleAware.org | 0808 8020 133 (UK)*`,
};

export function defaultsForSport(sport: SportId): SportAlgorithmRules {
  return sport === "football" ? DEFAULT_FOOTBALL_RULES : DEFAULT_RACING_RULES;
}

export function mergeWithDefaults(
  parsed: Partial<SportAlgorithmRules>,
  sport: SportId
): SportAlgorithmRules {
  const defaults = defaultsForSport(sport);
  return { ...defaults, ...parsed };
}

export function parseRulesJson(json: string, sport: SportId): SportAlgorithmRules {
  try {
    const parsed = JSON.parse(json) as SportAlgorithmRules;
    return mergeWithDefaults(parsed, sport);
  } catch {
    return defaultsForSport(sport);
  }
}

/** Convert stored rules to text shown in the editor. */
export function rulesToEditorText(rules: SportAlgorithmRules): string {
  if (rules.format === "worksheet" && rules.worksheet) {
    return rules.worksheet;
  }
  const copy = { ...rules } as Record<string, unknown>;
  delete copy.format;
  delete copy.worksheet;
  return JSON.stringify(copy, null, 2);
}

/** Parse editor textarea — valid JSON or free-form worksheet text. */
export function parseRulesEditorInput(
  text: string,
  description: string,
  sport: SportId
): SportAlgorithmRules {
  const trimmed = text.trim();
  if (!trimmed) {
    const defaults = defaultsForSport(sport);
    return { ...defaults, rulesDescription: description || defaults.rulesDescription };
  }

  try {
    const parsed = JSON.parse(trimmed) as SportAlgorithmRules;
    const merged = mergeWithDefaults(parsed, sport);
    if (description) merged.rulesDescription = description;
    return merged;
  } catch {
    const defaults = defaultsForSport(sport);
    return {
      ...defaults,
      rulesDescription: description || defaults.rulesDescription,
      format: "worksheet",
      worksheet: text,
    };
  }
}

export function rulesDescriptionText(rules: SportAlgorithmRules): string | null {
  const desc = (rules as { rulesDescription?: string }).rulesDescription;
  return desc?.trim() ? desc.trim() : null;
}

export function historyDescriptionLabel(
  rules: SportAlgorithmRules,
  storedJson?: string
): string | null {
  const desc = rulesDescriptionText(rules);
  if (desc) return desc;
  if (rules.format === "worksheet") return "Worksheet rules";
  if (storedJson?.trim()) return "JSON rules";
  return null;
}

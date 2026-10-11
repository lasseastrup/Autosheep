# How survivors-likes work: spawning, XP and upgrades, runs, design

*Research for the survivors pivot ([`../PIVOT-SURVIVORS.md`](../PIVOT-SURVIVORS.md)), October 2026.*

**Method.** Compiled from web-search extracts of the linked pages; the pages themselves could
not be opened from the research environment, so wiki numbers are as the search results quoted
them. **(unverified)** marks a single community source, a translation or an inference;
**(conflicting)** marks sources that disagree.

---

## 1. Monster spawning

### 1.1 Vampire Survivors (VS): a wave table, one row per minute

**How a wave works**
- Each wave lasts one minute and sets three things:
  - the enemy pool;
  - a **minimum** number of enemies that must be alive;
  - a **spawn interval**.
- On each interval tick the game spawns enemies. If fewer than the minimum are alive, it spawns until the quota is filled. ([Fandom: Enemies](https://vampire-survivors.fandom.com/wiki/Enemies), [VS Wiki: Enemies](https://vampire.survivors.wiki/w/Enemies))
- Bosses and map events are separate entries scheduled inside the same wave. An event sets how many enemies, how many repeats, the interval between them, and an optional % chance to happen at all. ([Flower Wall (event)](https://vampire.survivors.wiki/w/Flower_Wall_(event)))

**Enemy caps**
- At 300 or more living enemies, the regular spawner stops. Only bosses and map-event enemies can still appear. ([Enemies](https://vampire.survivors.wiki/w/Enemies))
- The Curse page gives an absolute cap of **500**, whatever your Curse or Charm. ([Curse](https://vampire.survivors.wiki/w/Curse))
- The reading here is that 300 is the cap for the regular spawner and 500 is the hard cap. **(unverified)**

**Example densities**
- **Inlaid Library:** the minimum rises from 50 at 0:00 to 110 by 4:00 (third-party guide, [games.gg](https://games.gg/vampire-crawlers-the-turbo-wildcard-from-vampire-survivors/guides/vampire-survivors-inlaid-library-stage-guide/)).
- **Bat Country** (a special high-density stage) ([VS Wiki: Bat Country](https://vampire.survivors.wiki/w/Bat_Country), [Fandom](https://vampire-survivors.fandom.com/wiki/Bat_Country)):
  - 0:00: minimum 200, one spawn every 9 s;
  - 1:00: minimum 300, every 9 s;
  - 20:00 onward: minimum 300, every 0.1 s.
- Mad Forest's full minute-by-minute table of minimums and intervals was not found.

**Mad Forest timeline (partial)**

| Time | What happens | Source |
|---|---|---|
| 1:00 | Glowing Bat boss drops a chest. It's the only chest before 10:00 that can evolve a weapon. | [Fandom: Mad Forest](https://vampire-survivors.fandom.com/wiki/Mad_Forest), [Treasure Chest](https://vampire.survivors.wiki/w/Treasure_Chest) |
| 2:05 | Bat Swarm event, repeats twice | [Pipeestrello](https://vampire.survivors.wiki/w/Pipeestrello) |
| 3:00–12:00 | Large skeleton waves | [Skeleton](https://vampire.survivors.wiki/w/Skeleton) |
| 4:00, 12:00, 13:00 | Ghosts, plus a Ghost Swarm event at 13:01 | [Ghost](https://vampire.survivors.wiki/w/Ghost) |
| 10:00, 15:00 | Flower Wall ring for 30 s (the 15:00 one has an 80% chance) | [Flower Wall](https://vampire.survivors.wiki/w/Flower_Wall_(event)) |
| ~11:00, ~21:00 | Bosses that drop Arcana chests | [Arcana](https://vampire.survivors.wiki/w/Arcana) |
| 16:00–24:00 | Mostly strong enemies and much lower spawn volume (except at 20:00), ramping again from 25:00 **(unverified, translated)** | [NamuWiki](https://en.namu.wiki/w/Vampire%20Survivors/%EC%8A%A4%ED%85%8C%EC%9D%B4%EC%A7%80) |
| 21:00, 24:00, 25:00 | Giant Blue Venus. Killing the 25:00 one for the first time unlocks Hyper mode. | [Venus](https://vampire.survivors.wiki/w/Venus) |
| 30:00 | The Reaper | see Scaling below |

**Map events**
- These are bursts outside the normal spawn cycle.
- **Bat Swarm:** 50 bats cross the screen in a fixed direction and push other enemies along. ([Bat Swarm](https://vampire.survivors.wiki/w/Bat_Swarm))
- **Flower Wall:** a ring of high-HP flowers forms around the player and slowly closes in. It traps the player and enemies until it's broken or times out.

**Off-screen spawning and culling**
- Normal enemies spawn just outside the screen edge. They **despawn** if the player gets far enough away. ([Fandom: Enemies](https://vampire-survivors.fandom.com/wiki/Enemies))
- **Bosses never despawn.** They're teleported back onto the screen instead.
- A despawn lowers the alive count, so the minimum quota refills at the screen edge near the player. In effect, enemies left behind get recycled back in front of you. That's an inference, not a documented feature. **(unverified)**
- A Steam thread claims bosses keep a minimum spawn distance from the player. ([Steam](https://steamcommunity.com/app/1794680/discussions/0/3194744685908432743/)) **(unverified)**
- One clone developer switched from a spawn circle to spawning along the edges of the 16:9 view with padding, and pulled stragglers closer. The field got so dense he had to lower enemy counts. ([Fodi devlog](https://fodi.itch.io/free-version-survivors/devlog/1103193/build-65-new-enemy-spawn-and-teleport-system))
- Most VS enemies only do contact damage, and ranged enemies are few. ([Fandom: Enemies](https://vampire-survivors.fandom.com/wiki/Enemies)) Every threat walks into view, which is a big part of why spawning off-screen feels fair.

**Scaling**
- **"HP × Level" enemies** (mostly bosses) multiply their HP by your level. The value is locked when they spawn. ([Boss](https://vampire.survivors.wiki/w/Boss))
- **Curse** starts at 100%, stacks additively and has no cap. It raises enemy HP, speed, spawn frequency and quantity. The HP increase hits new spawns immediately; the other effects start at the next minute. ([Curse](https://vampire.survivors.wiki/w/Curse))
- **Hyper mode** raises the minimum counts and enemy speed.
- **Endless mode** adds +50% to spawn frequency and amount every 30-minute cycle ([Enemies](https://vampire.survivors.wiki/w/Enemies)). Guides also cite +100% enemy HP and +25% damage per cycle ([Siliconera](https://www.siliconera.com/how-to-unlock-endless-mode-in-vampire-survivors/)).
- **The Reaper** has 655,350 HP × your level, 65,535 power and speed 1,200. Another one spawns every minute after 30:00. ([Fandom: The Reaper](https://vampire-survivors.fandom.com/wiki/The_Reaper)) It's a timer, not a fight.

### 1.2 Brotato: short timed waves in a small arena

**Wave timing**
- 20 waves. Wave 1 lasts 20 s and each wave adds 5 s up to 60 s. Waves 9–19 last 60 s and wave 20 lasts 90 s. ([Brotato Wiki: Waves](https://brotato.wiki.spellsandguns.com/Waves))
- That's about **17.5 minutes of combat** in total, with a shop after every wave.

**Telegraphed spawns**
- Enemy groups spawn at scripted times.
- A **red X** marks where a group will appear, and the enemies arrive **1 s later**.
- Standing on the X moves the group somewhere else. Green Xs mark where trees will grow.
- Sources: [gameplay.tips](https://gameplay.tips/guides/brotato-ultimate-guide-to-enemies-and-waves.html), [Steam](https://steamcommunity.com/app/1942280/discussions/0/3810656958845428240/) (both community sources).

**Enemy cap**
- At most **100** enemies at once. Past that, a random non-elite dies **without dropping loot**. ([Brotato Wiki: Enemies](https://brotato.wiki.spellsandguns.com/Enemies))

**Danger levels** ([Danger Levels](https://brotato.wiki.spellsandguns.com/Danger_Levels), [Fandom](https://brotato.fandom.com/wiki/Danger_Levels), [Elite and Horde Waves](https://brotato.wiki.spellsandguns.com/Elite_and_Horde_Waves)). The percentage bonuses replace each other rather than stacking.

| Level | What it adds |
|---|---|
| D1 | New enemy types |
| D2 | One elite-or-horde wave, on wave 11 or 12 |
| D3 | +12% enemy HP and damage |
| D4 | +26%, and three elite/horde waves between waves 11 and 18 |
| D5 | +40%, and **two** wave-20 bosses at 75% HP each |
| Nightmare | +60%, and +10% enemy speed |

**Neutral targets**
- Trees spawn with 10 HP, +5 HP per wave, and drop consumables and loot crates. They give you a reason to roam the arena.

### 1.3 20 Minutes Till Dawn (20MTD): a population target for each enemy

**How the tables work**
- Each map has a table with one row per enemy. Each row sets a start time, HP, the **Max** number alive, how many spawn per cycle, and the cooldown between cycles. ([20MTD Wiki: Forest](https://20minutestilldawn.wiki.gg/wiki/Forest))
- Times below are "time remaining" on the 20-minute clock.

**Forest examples**
- **Elder (elite):** from 17:00 left. 1,000 HP, max 1, 10 s cooldown.
- **Shub-Niggurath (boss):** at 15:00 left. 2,500 HP.
- **Spawner:** at 8:40 left. 10,000 HP.
- **Lamprey surge in the second half:**
  - 9:55 left: 200 HP, max 30, 3 every 1 s;
  - 9:00 left: 250 HP, max 100, 5 per second;
  - 7:00 left: 400 HP, max 300, 14 per second.

**Difficulty**
- Darkness levels 0–15 stack on top of each other ([Darkness](https://20-minutes-till-dawn.fandom.com/wiki/Darkness)).
- Darkness multiplies the per-cycle count and changes the cooldown, but leaves Max alone ([Enemies](https://20minutestilldawn.wiki.gg/wiki/Enemies)).
- This is the easiest of these models to tune by hand.

### 1.4 Halls of Torment (HoT) and Deep Rock Galactic: Survivor (DRG)

**Halls of Torment**
- Each hall runs for 30 minutes, and boss timings are uneven.
- One Ember Grounds guide logs a boss at about 23:50 left, an elite at 15:50, a boss at 13:50 and the Wyrm Queen at 5:50. ([TheGamer](https://www.thegamer.com/halls-of-torment-ember-grounds-guide/))
- Bosses drop an ability scroll and a chest where you choose armor or jewelry. ([Wikipedia](https://en.wikipedia.org/wiki/Halls_of_Torment))
- Agony mode adds yellow-outlined **Champions**. They have extra abilities and drop scrolls, gold, extra Well buckets and run-only gear with 2× stats. ([Prima](https://primagames.com/gaming/halls-of-torment-what-is-agony-mode))

**Deep Rock Galactic: Survivor**
- A run ("dive") has **5 stages**. ([DRG Wiki: Objectives](https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives), [Elimination](https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination))
  - Swarm waves per stage are reportedly 1, 2, 3 and 3 for stages 1–4.
  - A supply pod arrives partway through each stage.
  - An **elite** ends the stage, then you get a **30-second extraction countdown** to reach the drop pod.
  - Stage 5: hatch 4 elite cocoons, then fight a Dreadnought.
- A progress bar acts as the clock, with milestones for swarms, the supply pod and the boss. ([Fantasy Warden](https://fantasywarden.com/games/deep-rock-galactic-survivor-beginners-guide))
- Players report that threat rises if you stall before extracting. ([Steam](https://steamcommunity.com/app/2321470/discussions/0/6292161380808023168/))
- **Mineable walls:** you can drill tunnels that funnel enemies, which turns the terrain into a tool. ([GameSpot](https://www.gamespot.com/articles/deep-rock-galactics-vampire-survivors-style-game-excels-by-giving-you-something-new-to-do/1100-6521414/))

### 1.5 Risk of Rain 2: the credit-based Combat Director

**Difficulty coefficient** ([Fandom: Difficulty](https://riskofrain2.fandom.com/wiki/Difficulty), [wiki.gg](https://riskofrain2.wiki.gg/wiki/Difficulty))
- `coeff = (playerFactor + minutes × timeFactor) × stageFactor`, where:
  - `playerFactor = 1 + 0.3 × (players − 1)`;
  - `timeFactor = 0.0506 × difficulty (1/2/3 for Drizzle/Rainstorm/Monsoon) × players^0.2`;
  - `stageFactor = 1.15^stagesCompleted`.

**Credit income** ([Directors](https://riskofrain2.fandom.com/wiki/Directors))
- Continuous directors earn `creditMultiplier × (1 + 0.4 × coeff) × (players + 1) / 2` credits per second.
- There are two standard directors, "Fast" and "Slow", with a multiplier of 0.75 each. The Teleporter director, active during the boss event, uses 2.0.
- The Scene and Camp directors instead get a lump sum when the level loads (map base × coeff), which populates the map at the start.

**Spending credits**
- Each enemy type is a "spawn card" with a cost, grouped into weighted categories.
- The director rolls a card and buys a small group of that enemy.
- It rerolls a card that's "too cheap": one where even a full pack of elites (36× or 216× the base cost, depending on stage) would cost less than its banked credits. The exception is when that card is the most expensive option available. ([Difficulty](https://riskofrain2.fandom.com/wiki/Difficulty))
- The result: a director with lots of credits buys fewer, scarier enemies, often elites, instead of more trash.
- The standard directors shut off 3 s after the teleporter is activated, and the boss director takes over.

**Why it matters for pacing**
- Credits build up between purchases, so spawns arrive in **bursts**.
- One patch reportedly made directors wait longer between bursts, giving "longer pauses and larger batches". ([Steam](https://steamcommunity.com/app/632360/discussions/0/1626286205704127115/)) **(anecdotal)**
- Left 4 Dead's AI Director aims for the same feel. A developer at Turtle Rock (the studio behind Left 4 Dead) describes it as a roller coaster where "things would get quiet, and then things would go batshit crazy". ([Shacknews](https://shacknews.com/article/82787/how-evolve-assures-action-peaks-and-valleys))

### 1.6 Pacing and fairness

**Lulls and spikes**
- **VS:** the minute table gives stepped pressure. Events add spikes, and there are deliberate dips such as the Mad Forest 16–24 stretch.
- *The Conversation* credits two things for the "one more run" pull ([The Conversation](https://theconversation.com/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game-203613)):
  - calm stretches alternating with tense ones;
  - near misses, such as dying close to the next chest or level.
- **Brotato:** the shop is the lull, and the horde/elite waves 11–18 are the spikes.
- **DRG:** objectives provide the milestones.
- **Survivor.io:** a boss at every 5-minute mark of a 15-minute run. ([Naavik](https://naavik.co/deep-dives/survivorio-archeros-footsteps/))

**Avoiding unfair off-screen deaths**
- Spawn at the screen edge so enemies walk into view.
- Make most enemies melee.
- Mark spawns 1 s ahead, and let the player block them (Brotato).
- Keep big sweeps predictable: fixed-direction bats, slow-closing rings.
- Make ranged enemies hold a set distance instead of firing from off-screen (DRG Spitters).
- Teleport bosses back into view rather than letting them lurk off-screen.
- HoT can display your pickup radius, per a Steam changelog found via search ([Steam](https://steamcommunity.com/app/2218750/discussions/0/3807283698658520360)).

### 1.7 Enemy archetypes as movement puzzles

| Archetype | Examples | Puzzle it creates |
|---|---|---|
| Swarmer / chaser | VS bats and skeletons; DRG Grunts ([Creatures](https://deeprockgalactic.wiki.gg/wiki/Survivor:Creatures)) | Circle-kite them, bunch them up for area attacks |
| Sweeper | VS Bat Swarm | Step out of the lane |
| Encircler | VS Flower Wall | Break out, or fight in a shrinking space |
| Ranged kiter | Brotato Spitter, which backs off when you get close ([Enemies](https://brotato.wiki.spellsandguns.com/Enemies)); DRG Spitter, which holds medium range | You have to leave the safe spot to chase it |
| Exploder | DRG Exploder: blows up in an area that also hurts other bugs, and you can set it off from range | Keep your distance, or use it as a bomb |
| Tank that breaks terrain | DRG Praetorian, which smashes weakened walls | Your safe spots can be broken |
| Flier | DRG Mactera, which ignores walls and pits | Terrain stops protecting you |
| Spawner | 20MTD Spawner (10,000 HP) | Push in and kill it before it floods the screen |
| Loot carrier | DRG Lootbugs (golden ones drop gold); Brotato trees | Worth a detour for the reward |
| Chest elite / boss | VS bosses (chest); HoT bosses (scroll + chest); DRG elites (end the stage) | A focal fight that pays out |
| Timer enforcer | VS Reaper | Ends the run |

---

## 2. XP, level-ups and upgrade choices

### 2.1 Drops, gems and pickup radius

**VS experience gems**
- Blue gems are worth up to 2 XP, green up to 9, and red anything more. ([Experience Gem](https://vampire.survivors.wiki/w/Experience_Gem))
- Once **400 gems** are on the ground, new XP goes into one red gem instead of dropping more.
- Players report that merged red gems can grant several levels at once. ([Steam](https://steamcommunity.com/app/1794680/discussions/0/3829793451738405084))
- The Growth stat multiplies gem value.

**VS pickup radius ("Magnet")** ([Magnet](https://vampire.survivors.wiki/w/Magnet), [Vacuum](https://vampire.survivors.wiki/w/Vacuum))
- The base radius is 30.
- The Attractorb passive multiplies it, reportedly up to 3.98× at level 5. **(conflicting)**
- The Magnet PowerUp (a permanent upgrade bought between runs) adds +25% per rank, up to +50%.
- The **Vacuum** floor pickup pulls in every gem on the map. It only drops after level 12.

**Brotato materials**
- Materials are **XP and currency at the same time** ([Materials](https://brotato.wiki.spellsandguns.com/Materials)), so every pickup feeds both your level and your shop budget.
- Materials you miss go into a sack. Next wave, pickups count double until you've made up that amount. ([Steam](https://steamcommunity.com/app/1942280/discussions/0/3364775865377637585))

**HoT pickup radius**
- The default radius is tiny; you basically have to step on items. That makes the Pickup Range blessing a top pick. ([Prima](https://primagames.com/?p=145276))

### 2.2 XP curves

**Vampire Survivors** ([Level up](https://vampire.survivors.wiki/w/Level_up), [Module:Experience](https://vampire.survivors.wiki/w/Module:Experience))
- Level 1→2 costs 5 XP. Each level then costs +10 more up to level 20, +13 more per level from 21 to 40, and +16 more per level after that.
- Levels 20 and 40 cost an extra **600** and **2,400** XP. You get +100% Growth during those two levels to soften it.
- Totals: 1,805 XP to reach level 20, 2,600 to reach level 21.

Cost of a single level, worked out from those rules:

| Level | XP to next level |
|---|---|
| 1→2 | 5 |
| 10→11 | 95 |
| 19→20 | 185 |
| 20→21 | 795 |
| 30→31 | ≈325 |
| 40→41 | ≈2,855 |
| 50→51 | ≈615 |
| 99→100 | ≈1,400 |

Each level costs a bit more than the last, so the total climbs quadratically. Enemy density and Curse also rise over a run. The result is a flood of level-ups early, then a steady rhythm with two deliberate speed bumps at 20 and 40.

**Brotato** ([Experience](https://brotato.wiki.spellsandguns.com/Experience))
- Each level costs **(level + 3)²** XP: 16, then 25, up to 169 at level 10 and 784 at level 25.
- Because the curve is quadratic, +20% XP gain gives you fewer than 20% more levels.

### 2.3 The level-up screen

**Vampire Survivors**
- The game pauses and offers **3 or 4** different weapons or passives. ([Level up](https://vampire.survivors.wiki/w/Level_up), [Luck](https://vampire.survivors.wiki/w/Luck))
  - The chance of a 4th option is `1 − 1/Luck`.
  - Luck also makes items you already own show up more often.
- You get **6 weapon slots and 6 passive slots**. Once they're full, new items stop being offered.
- Reroll, Skip and Banish come as limited charges bought as PowerUps. Banish removes an item from the pool for the rest of the run. ([Fandom: PowerUp](https://vampire-survivors.fandom.com/wiki/PowerUp?oldid=5168))
- Most weapons cap at level 8 and passives at 5. (From memory, not re-checked.)
- Once everything is maxed, each level-up offers **25 gold or Floor Chicken (+30 HP)**. ([Steam](https://steamcommunity.com/app/1794680/discussions/0/3195868146170114564))
- **Limit Break** (unlocked by finding a relic) changes those maxed-out picks into small stat boosts for one weapon. ([Prima](https://primagames.com/tips/how-to-limit-break-in-vampire-survivors))

**Brotato**
- Level-ups only offer **stat** upgrades. Weapons and items come from the shop.
- You pick them **between waves**, together with crates you collected during the wave, so combat never pauses. ([Wikipedia](https://en.wikipedia.org/wiki/Brotato))
- 3 or 4 cards per level-up; sources differ. **(unverified)**
- **Shop** ([gameplay.tips](https://gameplay.tips/guides/brotato-useful-tips-for-the-shop.html)):
  - 4 slots;
  - locking a slot also locks its price;
  - buying all 4 gives a free reroll;
  - which item tiers appear depends on the wave and your Luck.

**20 Minutes Till Dawn**
- 5 options by default, 4 at higher Darkness. Wikipedia says 4. **(conflicting)**
- Upgrades sit in trees, with 4 tiers per category. Synergy upgrades appear once you've met their conditions. ([Modes](https://20-minutes-till-dawn.fandom.com/wiki/Modes))

**DRG: Survivor** ([Mid-dive Upgrades](https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades))
- Upgrade cards come in Uncommon, Rare, Epic and Legendary.
- Bonuses stack additively.
- Rerolls cost gold, and the price climbs: **5, 7, 10, 14, 20, 28…**

### 2.4 Build-crafting systems

**VS evolutions and unions** ([Evolution](https://vampire.survivors.wiki/w/Evolution), [Treasure Chest](https://vampire.survivors.wiki/w/Treasure_Chest))
- A weapon at max level, plus its paired passive at any level, plus a **boss chest opened at 10:00 or later**, evolves the weapon.
- Usually one evolution per chest.
- **Unions** fuse two maxed weapons into one.
- Players work out the recipes themselves, and that discovery is the core payoff.

**HoloCure collabs** ([TechRaptor](https://techraptor.net/gaming/guides/holocure-collab-guide), [CommonSenseGamer](https://commonsensegamer.com/holocure-all-collab-and-super-collab-weapons-full-guide/))
- Get two specific weapons to max level 7, and a **golden anvil** starts dropping. Use it to fuse them.
- The fused weapon takes **one** slot, which frees up another.
- A Super Collab adds a specific item and needs the Golden Hammer, so you get one per run.
- Regular anvils add +1 upgrades to weapons.

**Brotato** ([Weapon class](https://brotato.wiki.spellsandguns.com/Weapon_class), [Fantasy Warden](https://fantasywarden.com/games/brotato-beginners-guide))
- Weapon **classes** give set bonuses once you hold 2–3 of them, scaling up to 6. Example: Precise gives +6% crit at 3 weapons, rising to +15% at 6.
- The shop has a 15% chance per weapon offer to match a class you own.
- Two identical weapons of the same tier merge into the next tier (tiers I–IV).
- Most characters have 6 weapon slots; the range across characters is 1 to 12.
- Developer Thomas Gervraud describes it as horde survival plus an auto-chess-style shop. ([Chalgyr](https://www.chalgyr.com/2023/06/news-brotato-release.html))

**Halls of Torment** ([HoT Fandom: Ability](https://hot.fandom.com/wiki/Ability))
- Up to **6 abilities** per run, out of 27.
- Each ability has 3 possible upgrades, and you can take 2 per run.
- An ability's upgrades unlock after you've picked rank **III** and **VI** of that ability's traits.

**DRG: Survivor** ([Overclocks](https://deeprockgalactic.wiki.gg/wiki/Survivor:Overclocks))
- "Overclocks" are modifiers you pick at set weapon levels: balanced ones at **6** and **12**, an "Unstable" one at **18**.
- You can recycle an overclock offer for a bonus weapon level instead.
- You carry 4 weapons.

**Other games**
- **Survivor.io:** each weapon pairs with a passive item to evolve. ([MuMu](https://www.mumuglobal.com/blog/survivor-io-guide.html))
- **Death Must Die:** builds come from god blessings and random items. Luck affects proc chances, not rarity. ([Prima](https://primagames.com/?p=209280))
- **Nova Drift:** upgrades come from tiered mod trees. ([devlog](https://pixeljam.itch.io/nova-drift/devlog/84291/the-virulence-update-is-live))
- **Rogue: Genesia:** a branching map with shops and challenges between fights, like Slay the Spire. ([Checkpoint](https://checkpointgaming.net/reviews/2025/03/rogue-genesia-review-unlimited-power/))
- **Ball x Pit:** you fire elemental balls with Breakout-style physics. ([Mobalytics](https://mobalytics.gg/gamebase/reviews/ball-x-pit-review))

### 2.5 Chests and treasure

**VS chests**
- Usually 1 item, sometimes 3 or 5. ([Treasure Chest](https://vampire.survivors.wiki/w/Treasure_Chest))
- Luck only improves chest quality, and the odds are set per boss.
- A Steam post cites 10% for 3 items and 3% for 5. **(unverified)**
- A Substack claims the first chests of a run are scripted to be generous. ([Substack](https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors)) **(unverified)**
- Creator Luca Galante says his background in the gambling industry shaped only the chest-opening moment. ([Game Developer](https://www.gamedeveloper.com/design/vampire-survivors-development-sounds-like-an-open-source-fueled-fever-dream))

**VS Arcanas** ([Arcana](https://vampire.survivors.wiki/w/Arcana))
- Arcanas are run-wide rule changes.
- You choose one at the start of the run.
- Bosses at about **11:00 and 21:00** drop Arcana chests with 4 choices (6 once you've unlocked 23 or more).

**HoT: the Well** ([Prima](https://primagames.com/gaming/how-to-keep-items-permanently-in-halls-of-torment))
- You can send **one** looted item down the Well per run.
- After the run you buy it back with gold, and it's yours for future runs.
- Agony mode drops extra buckets, which allow more than one item.

### 2.6 Stat vocabulary

VS PowerUps (permanent upgrades bought with gold between runs), per rank, with max ranks in brackets ([Fandom: PowerUp](https://vampire-survivors.fandom.com/wiki/PowerUp?oldid=5168), [PCGamesN](https://www.pcgamesn.com/vampire-survivors/power-ups-best)):

| Stat | Per rank (max ranks) |
|---|---|
| Might | +5% (5) |
| Armor | −1 incoming damage (3) |
| Max Health | +10% (3) |
| Recovery | +0.1 HP/s (5) |
| Cooldown | −2.5% (2) |
| Area | +5% (2) |
| Speed (projectile) | +10% (2) |
| Duration | +15% (2) |
| Amount | +1 projectile (1) |
| Move Speed | +5% (2) |
| Magnet | +25% (2) |
| Luck | +10% (3) |
| Growth (XP) | +3% (5) |
| Greed (gold) | +10% (5) |
| Curse | +10% enemy HP, speed, quantity and frequency (5) |
| Revival | Revive at 50% HP (1) |
| Reroll / Skip / Banish | Charges; counts vary by version |

Brotato adds Harvesting (income at the end of each wave), Dodge, Range, Engineering (turrets) and % Pickup Range. ([Stats](https://brotato.wiki.spellsandguns.com/Stats))

---

## 3. Run structure and meta-progression

| Game | Run length | How it ends |
|---|---|---|
| VS | 30 min (some special stages are shorter) | The Reaper arrives at 30:00 |
| Brotato | 20 waves, about 17.5 min of combat | Kill the wave-20 boss |
| 20MTD | 20 min | Survive until dawn |
| HoT | 30 min per hall | Final boss after the timer ([review](https://antares.neocities.org/blog/review-halls-of-torment)) |
| DRG: Survivor | 5 stages, about 20–40 min ([Gamereactor](https://www.gamereactor.eu/deep-rock-galactic-survivor-impressions-your-next-obsession-1301383/)) | Kill the Dreadnought, then extract |
| HoloCure | 20 min | Mid-boss at 10:00, final boss at 20:00 ([Samurai Gamers](https://samurai-gamers.com/holocure/stage-1-grassy-plains-walkthrough-and-guide/)) |
| Survivor.io | 15 min | A boss every 5 min ([PocketGamer.biz](https://www.pocketgamer.biz/how-innovation-and-iteration-has-transformed-survivorio)) |
| Army of Ruin | 10, 15 or 20 min, or endless | Survive ([Outerhaven](https://theouterhaven.net/army-of-ruin-review)) |
| Megabonk | About 10 min per stage | Explore, then find the boss portal ([KeenGamer](https://www.keengamer.com/articles/guides/megabonk-beginners-guide-how-to-play-build-survive-your-first-run/)) |

### How each game drip-feeds content between runs

**Vampire Survivors** ([RogueRanker](https://rogueranker.com/vampire-survivors-achievements/))
- Gold buys PowerUps.
- Achievements unlock content:
  - most weapons unlock when you get another weapon to level 4 or 7 in a run;
  - characters unlock by survival time or special conditions;
  - stages unlock in chains, for example reaching level 80 in Inverse mode.
- Whole systems are locked behind **relics** you find on maps:
  - Randomazzo unlocks Arcanas;
  - Great Gospel unlocks Limit Break;
  - Seventh Trumpet unlocks Endless.
- Complexity only arrives after you've mastered the basics.

**Brotato** ([CommonSenseGamer](https://commonsensegamer.com/brotato-how-to-unlock-all-characters/))
- 5 starting characters.
- More unlock by winning at each danger level, by total kills or materials collected, or by hitting stat challenges.
- Danger level is tracked separately for each character.

**Halls of Torment**
- Rescuing the Wellkeeper in the second hall unlocks the Well.
- Quests unlock characters and items.
- **Blessings** are permanent stat ranks bought with gold, and you can refund them at any time. ([Blessing](https://hot.fandom.com/wiki/Blessing))

**DRG: Survivor** ([Prima](https://primagames.com/gaming/how-to-unlock-all-classes-in-deep-rock-galactic-survivor))
- Classes unlock at player rank 1, 3, 5 and 7.
- Weapons unlock by class level, the last at about level 27.
- Hazard levels (difficulty tiers) unlock by completing objectives.
- Permanent upgrades cost credits plus minerals mined during runs. Each has 12 ranks.

**20 Minutes Till Dawn** ([NamuWiki](https://en.namu.wiki/w/20%20Minutes%20Till%20Dawn), [ProdigyGamers](https://prodigygamers.com/2022/06/17/20-minutes-till-dawn-runes-where-to-find-upgrade/))
- 24 runes in 2 groups of 4 tiers. You equip 8, and each can be upgraded to level 5.
- Darkness levels unlock one at a time.

### Character design

**Vampire Survivors:** a character is a starting weapon plus a passive that grows with level. ([TV Tropes](https://www.tvtropes.org/pmwiki/pmwiki.php/Characters/VampireSurvivors), [gameplay.tips](https://gameplay.tips/guides/vampire-survivors-ultimate-basic-guide-weapons-passive-boosts-characters-etc.html))

| Character | Starting weapon | Passive |
|---|---|---|
| Antonio | Whip | +10% Might every 10 levels, up to +50% |
| Imelda | Magic Wand | +10% Growth every 5 levels, up to +30% |
| Gennaro | Knife | +1 Amount |
| Poe | Garlic | +25% Magnet, −30 Max HP |

**Other games**
- **Magic Survival:** its 24 classes are mainly your starting spell. ([TapTap](https://www.taptap.io/post/1741711))
- **Brotato:** characters bend the rules much harder. One spends Max HP as currency. ([Epic](https://store.epicgames.com/news/our-brotato-guide-highlights-the-best-spuds-to-take-into-battle))

---

## 4. Design philosophy

### 4.1 poncle (Luca Galante, creator of Vampire Survivors)

**Origins**
- The prototype played "exactly like Magic Survival", a mobile game. ([PC Gamer](https://www.pcgamer.com/vampire-survivors-creator-didnt-have-a-vision-when-he-started-making-the-game-that-allowed-him-to-quit-his-job/), [Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors))
- It was built in the Phaser engine with free assets. ([Game Developer](https://www.gamedeveloper.com/design/vampire-survivors-development-sounds-like-an-open-source-fueled-fever-dream))
- He "didn't have a vision" and built it "piece by piece". He cared more about weapons feeling distinct than about balance. (PC Gamer)

**Principles he names**
- The game is "easy to play, makes you feel good, and avoids frustration". ([GameSpot](https://www.gamespot.com/articles/im-making-this-for-me-not-to-make-everyone-happy-vampire-survivors-creator-on-his-next-game/1100-6536362/))
- The core verb is spells you improve very simply: bigger, more projectiles, faster. (Via [80.lv](https://80.lv/articles/vampire-survivors-developer-on-its-design-sudden-success) coverage; secondhand attribution.)
- Gambling influence is limited to the chest moment. ([PC Gamer](https://www.pcgamer.com/vampire-survivors-saved-its-creator-from-working-on-mobile-gambling-games/))

**"Reverse bullet hell"**
- You *are* the bullet hell: one movement input, automatic attacks, and a climb from fragile to demigod. ([Substack](https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors))
- Runs usually top out at 15–30 minutes. ([Epic](https://store.epicgames.com/news/vampire-survivors-built-genre-autoshooter-bullet-heaven))

### 4.2 Criticisms, and what later games changed

**Screen clutter**
- In late VS runs, players say you "literally can't see anything". ([Steam](https://steamcommunity.com/app/1794680/discussions/0/4631482569784862180))
- poncle reportedly won't add a weapon-opacity slider. **(secondhand)**
- Rogue: Genesia gets the same complaint, plus performance problems. ([Vaporlens](https://vaporlens.app/app/2067920/rogue_genesia))

**Performance**
- VS moved from Phaser to Unity in v1.6 (August 2023) for "big performance improvements", cross-platform support and co-op. ([GamingOnLinux](https://gamingonlinux.com/2023/07/vampire-survivors-switching-to-new-game-engine-on-august-17))
- Every game caps something: VS caps enemies (300/500) and gems (400); Brotato caps enemies at 100.

**Long, samey runs**
- DRG: Survivor's studio wanted to replace "this endless 30-minute chore that is a Vampire Survivors run" with chunks, missions and sub-missions. The quote is from studio founder Anders Leicht Rohde, found in a search extract of a [GamesRadar/Edge feature](https://www.gamesradar.com/games/action/vampire-survivors-kicked-off-a-game-development-gold-rush-but-has-a-legitimately-new-genre-emerged-between-the-cash-ins/); see also [NME](https://www.nme.com/features/deep-rock-galactic-survivor-finds-joy-in-breaking-the-rules-of-vampire-survivors-3461649).
- HoT players ask for 15–20 minute runs ([Steam](https://steamcommunity.com/app/2218750/discussions/0/3833171785694385131/)), and reviewers call its pacing slow ([Playday](https://playday.one/2025/10/28/halls-of-torment-review/)).

**Builds that stop involving decisions**
- 20MTD's builds "funnel toward similar outcomes". ([Wikipedia](https://en.wikipedia.org/wiki/20_Minutes_Till_Dawn))
- Rogue: Genesia "can get incredibly easy". ([Game8](https://game8.co/articles/reviews/6824))

**What later games did about it**
- **Brotato:** short waves with a shop full of decisions after each one.
- **20MTD:** manual aiming and reloading.
- **HoT:** click-to-attack and gear like an action RPG. ([PC Gamer](https://pcgamer.com/games/action/halls-of-torment-review))
- **DRG:** terrain you can mine, objectives, and extraction.
- **Megabonk:** exploration and risky shrines. For example, you stand in a charge shrine for about 10 s, exposed, to earn a buff. ([Megabonk wiki](https://megabonkwiki.net/articles/all-megabonk-interactables-explained))
- **HoT Agony and Army of Ruin's "Ruin" levels:** extra difficulty you opt into.

### 4.3 Mobile

**Vampire Survivors on mobile** ([TouchArcade](https://toucharcade.com/2022/12/09/vampire-survivors-mobile-review-controller-cloud-save-sync-dlc-unlock-iphone-ipad-pro/), [Tom's Guide](https://www.tomsguide.com/news/play-one-of-2022s-biggest-games-for-free-on-android-and-ios-now))
- Free with no in-app purchases. Ads are optional: one revive per run, or a gold bonus.
- It **boots in portrait**. You can switch to landscape in the options, but not mid-run.
- Control is a single virtual stick.

**Magic Survival** (LEME, 2019)
- One-handed controls, and ads after death. ([BlueStacks](https://www.bluestacks.com/apps/casual/magic-survival-on-pc.html))

**Survivor.io** (Habby)
- 15-minute runs with a boss every 5 minutes, one-thumb movement, and an energy system.
- Over $500M in in-app purchases. ([WN Hub](https://wnhub.io/news/finance/item-43301))
- Probably portrait; not confirmed from a source.

**What that means on phones**
- Keep threats away from the bottom-centre, where the thumb covers the screen.
- Runs of 10–15 minutes, or runs split into chunks, suit phone sessions.
- Saving level-up choices for breaks (as Brotato does) interrupts play less than VS's pause on every level.

---

## 5. Takeaways for a design that has to protect a herd

1. **Use a VS-style wave table.** Each minute sets an enemy pool, a minimum number alive and a spawn interval. Spawn on a ring around the camera, but keep a no-spawn radius around every sheep. That gives a constant, tunable baseline of pressure.
2. **Telegraph every spawn near the herd** with Brotato's 1-second marker. Let the dog or shepherd standing on a marker push the spawn away. Blocking spawns then becomes a herding action in itself.
3. **Scale pressure with herd size using a director budget.** RoR2 scales credits with player count; treat sheep count as that input. A bigger flock earns more threat credits and pricier enemies. RoR2's "too cheap" rule then gives you fewer, scarier wolves late on, not more noise.
4. **Make the herd the risk/reward dial, like VS's Curse.** Let flock size raise XP or wool income *and* the spawn rate, so growing the herd is a risk the player chooses.
5. **Turn map events into herding puzzles, on a fixed schedule players can learn.**
   - A fixed-direction swarm, like VS's bats, becomes a stampede lane to steer the flock out of.
   - A closing Flower Wall ring becomes a corral to gather inside or break out of.
6. **Build enemy types around the flock:**
   - chasers that target stragglers;
   - chargers that scatter the herd;
   - ranged enemies that hang back and must be chased down;
   - exploders that hurt both sides and can be lured;
   - tanks that break fences (like DRG's Praetorian);
   - fliers that ignore terrain;
   - a thief that grabs a sheep and runs for the screen edge, forcing a chase. (The thief is an extrapolation, not a mechanic from any of these games.)
7. **Recycle enemies rather than flooding the screen.** Phones need low counts.
   - Cap enemies around 100, like Brotato, and silently remove extras without loot.
   - Despawn enemies that fall far behind, and let the minimum quota refill them on the ring ahead of the flock.
   - Teleport bosses back into view instead of despawning them.
   - Merge XP into one big gem past a ground cap (VS uses 400).
8. **Ease the "guard the flock vs grab XP" tension.** Options:
   - a generous pickup radius;
   - sheep that graze up nearby gems;
   - a Vacuum-style "bell" pickup that collects everything;
   - Brotato's sack, which pays back missed pickups next wave.
9. **Level-ups: 3 choices (4 with Luck), 6 weapon and 6 passive slots, limited rerolls, skips and banishes.** Add herd passives such as fence regeneration, sheep HP or dog count. Pair them with evolutions that need a max-level weapon, a specific passive and an elite's chest after a time gate. That gives a mid-run discovery payoff.
10. **Pace runs at 10–15 minutes, or in chunks, for phones.**
    - Survivor.io: 15 minutes with a boss every 5.
    - DRG: stage, then elite, then a 30-second extraction; here, extraction could be "drive the flock into the pen".
    - Alternate calm (pen or shop breaks) with spikes. Save level-up choices for the breaks where possible.
11. **Drip-feed systems through unlocks**, the way VS hides systems behind relics and Brotato ties characters to danger-level wins.
    - Unlock sheep breeds, dogs and new threat types through achievements.
    - A Halls of Torment-style "Well" could let you carry one item, or one prize sheep, into the next run.
12. **Protect readability.**
    - Draw sheep and their health above weapon effects.
    - Ship an effect-opacity option from day one; VS players complain about its absence.
    - Keep threats out of the thumb zone.
    - Prefer fewer, readable enemies over hundreds of tiny ones.

---

## Gaps

Not verified: Mad Forest's full table of minimums and intervals, VS's exact chest odds, and
whether culled enemies are deliberately moved ahead of the player; how many options a Halls of
Torment level-up offers, and its full trait structure; whether a Brotato level-up shows 3 or 4
cards, and how its "Looter" enemy behaves; whether Survivor.io is portrait; the exact size of a
group spawned by Risk of Rain 2's director; Megabonk's default number of weapon slots.

# AUTOSHEEP: SURVIVORS — pivot plan

*Branch `claude/survivors-pivot` · October 2026 · proposal; S0 built (§11.1) and changed after the first playtest (§11.2)*

> **Nobody touches my sheep.** A survivors-like (Vampire Survivors, Brotato, Halls of Torment)
> in which the thing you are keeping alive is not you but a growing flock. Every grabby species
> in the galaxy wants Earth's sheep, and General Gafoop, armed only with stationery, has to hold
> on to as many of them as he can until the Galactic Bureau reconvenes. You move; your weapons
> fire themselves; the sheep are, and remain, sheep.

This document is the plan for trying that direction on a branch. It does not replace
[`DESIGN.md`](DESIGN.md); the automation game stays on the main line. Research behind it:
[`research/survivors-genre.md`](research/survivors-genre.md) (how the genre's systems work) and
[`research/protect-the-herd.md`](research/protect-the-herd.md) (escort, defence and herding
games).

---

## 1. The pivot in one page

### 1.1 Pitch

You are the sheepdog. A small flock grazes in the middle of the screen; Gafoop flies circles
round it on his hover-disc while his weapons (a rubber stamp, a stapler, a paper shredder)
go off on their own. Waves of alien claim-jumpers come in from the edges, and most of them are
not after Gafoop at all: they want sheep. Little goo blobs gang up three to a sheep and carry
it off like ants with a crumb, saucers park over the flock and start beaming one up, robot
wolves cut a straggler out and drive it away. Kill the carrier and the sheep drops, dazed, and
trots back. The flock is your health bar, and it is also your engine. Calm, fed sheep grow
wool, wool is experience, and every level-up is a choice: a new gadget for Gafoop or one for
the flock (bell collars that ring out shockwaves, static wool that arcs lightning from sheep to
sheep, brass collies that circle the herd). Stray sheep are scattered all over the map; fetch
them and the flock grows, which makes you stronger and gives the enemy more to grab. Survive
until the Bureau reconvenes and the sheep you are still holding are counted.

The name can stay: in this genre the *auto* is the weapons.

### 1.2 What changes, what stays

| | Automation game (main line) | Survivors pivot (this branch) |
|---|---|---|
| Fantasy | Build a civilisation around sheep | Be the sheepdog: keep the flock together under attack |
| Session | One persistent valley, hours | Runs of 15–20 minutes, then a between-runs shop and unlocks |
| Gafoop | Harmless, leads with a bucket, builds | Fights with auto-firing stationery; herds by proximity, as a sheepdog, and calls with the bucket |
| Shearing | By hand, then in sheds the player builds | Only in the Bureau's shearing booths on the map: the flock is herded in |
| The flock | A logistics layer | The health bar, the XP engine and a weapon platform |
| Threats | Light hazards only | Waves of alien claim-jumpers who take sheep (never harm them) |
| Progress | Bureau Forms, Audits, eras | Level-ups in a run; Forms become unlock goals between runs |
| Reused | Renderer, art, audio, voices, intro, flock model + contract, grass, phone controls, perf tooling | All of it |
| Set aside | — | Building, stations, races, the works (kept in the code, out of the menu) |

### 1.3 Pillars

1. **Sheep are sheep** (unchanged). Sheep never plan, never decide, never understand. They do
   only what sheep do: flee, follow, bunch, graze, panic, and a ram butts whatever comes too
   close. Gear on a sheep works by itself; the sheep does not notice it is wearing it. Every
   sheep reaction is the flock model.
2. **You are the sheepdog.** The skill is circling a flock and turning danger back, not running
   away on your own. Spawns, targeting and the camera all push Gafoop to orbit the herd.
3. **The flock is the power.** Herd size and calm drive experience and the strength of herd
   gear. Protecting the flock is how you get strong, so it never feels like an escort mission
   with a liability attached.
4. **Taken, never harmed.** It is the law (§3.1): nobody may hurt the dominant species. Losses
   are abductions, telegraphed and reversible until the sheep leaves the map.
5. **Bureaucracy is the boss fight** (unchanged). A run is a hearing, the run timer is the
   Bureau's docket, unlock goals are Forms, weapons are office supplies.
6. **A diorama you want to stare at** (unchanged). Hundreds of things on screen at 640×360 must
   still read: white sheep, saturated aliens, warm projectiles.

---

## 2. What the genre does

A summary of the two research files, which have the numbers and the sources:
[`research/survivors-genre.md`](research/survivors-genre.md) (how the genre's systems work) and
[`research/protect-the-herd.md`](research/protect-the-herd.md) (escort, defence and herding
games, and games where the thing you protect is your economy). Both were compiled from
web-search extracts; nothing here rests on what they mark unverified.

### 2.1 Spawning

- **Vampire Survivors runs on a minute table.** Each minute of a stage sets an enemy pool, a
  minimum number alive and a spawn interval; whenever fewer than the minimum are alive, it tops
  up. Bosses and map events (fifty bats sweeping across the screen, a ring of flowers closing
  in) are scheduled entries in the same table. The regular spawner stops at 300 living enemies
  (500 is the hard cap). Enemies spawn just off screen and despawn when left far behind, so the
  quota refills ahead of the player; bosses are teleported back instead. Most enemies are melee,
  so every threat walks into view, which is much of why off-screen spawning feels fair.
- **Brotato telegraphs.** A red X marks where a group will appear a second before it does, and
  standing on the X moves the group elsewhere. Waves are short (20 s, rising to 60 s), at most
  100 enemies are alive (extras vanish without loot), and higher danger levels add elite and
  horde waves in the second half.
- **20 Minutes Till Dawn** gives each enemy type a row: start time, most alive, how many per
  cycle, cooldown. The easiest model to tune by hand.
- **Risk of Rain 2's director** earns credits over time and spends them on enemy "spawn cards".
  Credits pile up between purchases, so spawns come in bursts, and a director with credits to
  spare buys fewer, scarier enemies rather than more of the cheap ones. Left 4 Dead's director
  aims for the same peaks and valleys.

### 2.2 Experience and level-ups

- **Curves.** Vampire Survivors: level 1→2 costs 5, then each level costs 10 more than the last
  up to level 20, with one-off bumps at levels 20 and 40. Brotato: (level + 3)². Both give a
  flood of level-ups early and a steady rhythm later.
- **Pickups.** Past 400 gems on the ground, Vampire Survivors merges new experience into one big
  gem. Pickup radius (the magnet) is a core stat. Brotato keeps missed pickups in a sack and pays
  them back next wave.
- **The choice.** Three cards, a fourth with luck. Six weapon and six passive slots (Vampire
  Survivors, HoloCure), weapons to level 8, passives to 5. Rerolls, skips and banishes are
  charges bought between runs. Once everything is maxed, the cards give gold or healing.
  Brotato saves its choices for between waves, which interrupts play less: a point for phones.
- **Build-crafting.** Evolutions (a maxed weapon, its paired passive and a boss chest after
  10:00), HoloCure's collabs (two maxed weapons fused into one slot), Brotato's class set
  bonuses, Deep Rock Galactic: Survivor's overclocks at fixed weapon levels. Players working out
  the recipes for themselves is the payoff.
- **Chests** usually hold one item, sometimes three or five. Luca Galante, Vampire Survivors'
  creator, says his years in the gambling industry shaped only the chest-opening moment.

### 2.3 Runs and meta-progression

- **Lengths**: Vampire Survivors 30 minutes (the Reaper ends the run), Brotato about 17.5 minutes
  of combat, 20 Minutes Till Dawn and HoloCure 20, Survivor.io 15 with a boss every five
  minutes. Thirty-minute runs are the genre's commonest complaint ("an endless 30-minute chore",
  in the words of Deep Rock Galactic: Survivor's studio), and later games went shorter or broke
  runs into stages.
- **Between runs**: gold buys permanent stat ranks (Vampire Survivors' PowerUps, Halls of
  Torment's Blessings); achievements unlock weapons, characters and stages; whole systems stay
  hidden until the basics are learnt. A character is a starting weapon and one passive.
- **Complaints to design against**: late-run clutter ("you literally can't see anything"), with
  no effects-opacity option; builds that stop involving decisions; performance with hundreds of
  enemies.

### 2.4 Protecting something

- **The niche looks open.** No survivors-like about herding turned up. The nearest are
  horde-of-minions games (Be My Horde, Boneraiser Minions), Deep Rock Galactic: Survivor's escort
  missions, Pikmin 4's Night Expeditions, *Herder* (2021, a small herding and tower-defence
  game) and sheep tower defences where aliens or raiders carry sheep to the exits
  (*TowerMadness*, *Operation Sheep Defense*).
- **Escorts work when failure is a process, not an instant.** In ICO the shadows drag Yorda
  off and she can be pulled back; in Resident Evil 4 one shot makes a carrier drop Ashley; in
  Defense Grid a carrier killed drops the core, which floats back home. They also work when
  the escort helps (BioShock Infinite's Elizabeth throws you ammo) rather than clings (Be My
  Horde's minions are criticised as passive and clingy), and when the player cannot just park it
  somewhere safe (the Resident Evil 4 remake removed Ashley's hiding places).
- **When the protected thing is the economy**, the good designs spend economy before lives
  (in Kingdom a hit drops a coin, and an archer drops their bow before anyone is lost; Sonic's
  rings can be grabbed back), cap what one wave can cost (Thronefall), keep replacements coming
  (Darkest Dungeon: "'loss' is not the same thing as 'failure'"), scale the threat to what you
  own but ease off after losses (RimWorld's raids), and warn before every attack (Into the
  Breach shows each one a turn ahead).
- **Warnings done right**: Plants vs Zombies' Bungee Zombie marks its target, yells, then hovers
  for about three seconds; Pikmin's Puffy Blowhog visibly breathes in before it blasts the squad
  apart.
- **Real herds**: predators take the sheep at the edge (in one study the birds hawks attacked
  were about 35 % farther from their neighbours), and real sheepdogs alternate two jobs:
  *collecting* stragglers and *driving* the gathered flock (Strömbom et al., 2014). Herdling keeps
  its herd near ten so each animal matters, and makes each one look different.

### 2.5 What this plan takes from it

| Mechanism | From | Here |
|---|---|---|
| A minute table, with a director on top | Vampire Survivors, Risk of Rain 2 | §7.2 |
| Spawn marks you can block by standing on them | Brotato | §7.3 |
| Carriers that drop what they carry | ICO, Resident Evil 4, Defense Grid, TowerMadness | §5.2 |
| Economy before lives | Kingdom, Sonic | §5.2: wool as a cushion |
| Threat that grows with the flock and eases after losses | RimWorld | §7.2 |
| A cap on what one bad moment can cost | Thronefall | §7.2 |
| A flock that helps instead of clinging | BioShock Infinite, against Be My Horde | §8.4: herd gear |
| No parking the flock | Resident Evil 4 remake | §5.6 |
| Runs of 15–20 minutes | Survivor.io, Brotato, the complaints about 30 | §9.1 |
| Evolutions from crates after minute 10 | Vampire Survivors | §8.5 |
| Collect, then drive | Real sheepdogs | §5.1 |
| Effects opacity from the start | Vampire Survivors' players | §11, S1 |

---

## 3. The backstory, revised

The current backstory forbids this game: *only sheep are alive on Earth*, *nothing bad ever
happens to a sheep*, and Gafoop is exiled to make sheep advanced. The fix keeps almost the whole
intro and changes only the ruling at the end.

### 3.1 The idea: possession is nine-tenths of the law

Everything up to the audit stays: the Almanac, the Blorxian Hegemony, the scan that mistakes
sheep for masters, §42.7(b) (*an invader may exterminate any species except the dominant one,
since somebody has to sign the surrender*), the nine-minute invasion, the hologram Auditor, and
the sheep eating Form 77-B.

The new ruling: **the dominant species has not surrendered, so Earth belongs to nobody. Under
the Code, an unclaimed planet goes to whoever is holding its dominant species when the Bureau
next convenes.** The sheep are protected property: *nobody may harm them; anybody may take
them.* Every fleet in the sector changes course. Gafoop's invasion has been ruled illegal, so the
Hegemony may not use force on Earth, and Gafoop may not bear arms. He may bear stationery.

So he crash-lands in a meadow with the sheep, a crate of Blorxian office supplies and one order:
*hold the flock until the Bureau reconvenes. In fifteen minutes.*

### 3.2 Every mechanic has a reason

| Mechanic | Why, in the fiction |
|---|---|
| Waves of enemies | Rival claimants and their hired acquisition crews, arriving from all over the sector |
| Enemies take sheep instead of hurting them | §42.7(b): the dominant species is protected. Nobody can sign a surrender if it is hurt |
| A lost sheep is gone for good (this run) | It has been taken off-world, to "a farm on Zorblax 9" (§3.6) |
| Gafoop's weapons are a stamp, a stapler, red tape | Exiled invaders may not bear arms. Nothing in the Code says anything about stationery |
| Defeated enemies vanish in a poof | They are deported by the Bureau, instantly, at their own expense. Cartoon poof, smoking shoes, as in the intro |
| The run timer | The time until the Bureau reconvenes. The intro's last frame becomes the first frame of the run: *THE BUREAU RECONVENES IN 15:00*. Later hearings are twenty minutes away |
| The flock grows | Sheep scattered everywhere after the invasion; nobody is left to farm them. More sheep, stronger claim |
| Level-ups | Blorp's supply drops, paid for in wool, which the Hegemony values "because it is soft" (DESIGN §6.4) |
| Shearing only in the booths | Under the Code nobody may harm the dominant species, and a General with shears in his hand would be a General with a weapon in his hand. The Bureau's licensed booths shear in single file, under supervision, with a receipt |
| Sheep shy away from Gafoop | He is a three-eyed green blob on a hover-disc, and sheep are sheep. The bucket helps |
| Gear on the sheep | *Protective equipment for the dominant species* is allowed under the Code. The sheep do not notice |
| Runs repeat | The Bureau rules on Earth one region at a time, adjourns, and reconvenes elsewhere. A failed claim can be appealed (retry) |
| Score | At the hearing the Auditor counts the sheep you are holding |
| Robot wolves, no real animals | Still true that only sheep are alive on Earth. The wolves are machines built by a rival who learnt about sheep from the same human picture books Gafoop did |

The old goal (sheep surpassing humans) is dropped from this branch; the microwave burrito
survives as a late boss (§9.1).

### 3.3 The intro: what stays and what changes

Shots 1–5 and the first half of shot 6 are untouched: lines N01–N08, G01–G05, B01–B02, C01–C02
and A01–A03, with their animation, music and sound. That is about two of the intro's three
minutes. What changes is the ruling (shot 6 from A04) and the exile (shot 7).

| Line | Now | Pivot |
|---|---|---|
| A01–A03, G05 | Present the dominant species · *That is a sheep* · *A very important sheep* (the sheep eats the form) | Keep |
| A04 | *…you have exterminated the dominant species. Your invasion is illegal.* | **New:** *The dominant species has eaten the surrender.* |
| G06 | *Easy! How advanced were the humans?* | **New:** *It is… thinking it over.* |
| A05 | *Unless… the sheep can be shown to be more advanced…* | **New:** *Then Earth belongs to nobody. Under the Code, an unclaimed planet goes to whoever holds its dominant species when the Bureau next convenes.* |
| new G | — | *And when is that?* |
| A06 | *Space travel. Nuclear power. The microwave burrito.* | **New:** *In fifteen minutes.* |
| new B03 | — | (Blorp, at a console) *Sir. Every fleet in the sector has just changed course.* |
| A07 | *…exiled to Earth, until the sheep surpass the humans.* | **New:** *The sheep are protected. Nobody may harm them. Anybody may take them. General, your invasion was illegal: you may not bear arms on Earth.* |
| new G | — | *Then how am I supposed to—* |
| new A08 | — | *You may bear stationery.* (gavel) |
| G07 | *Oh.* | Keep, moved here (the trombone still fits) |
| G08 | *Right! Listen up, troops! Today, you are livestock…* | **New:** *Right! Listen up, troops! Nobody… touches… my sheep!* |
| N09 | *Sheep, however, are sheep.* | Keep |

Shot 7 keeps the eject, crash and hatch, and adds two things: a crate stencilled OFFICE SUPPLIES
lands beside the pod, and after the speech the sneeze still scatters the flock, but now one
sheep trots happily into a tractor beam from a saucer overhead and rises out of frame. N09
lands on that. The title card ends on the run timer and hands straight over to the game.

Work: ten new voice lines through the existing Kokoro pipeline
(`tools/voice/generate.py`), the audit shot's icons swapped for a fleet-turning beat (the space
set has the ships), and a saucer and a crate in the country set. Shots, timing and the movie
export all already handle re-timed lines.

### 3.4 Tone guide changes

- *Only sheep are alive on Earth* stays true of Earth. Everything that attacks comes from space,
  or is a machine.
- *Nothing bad ever happens to a sheep* becomes **no sheep is ever hurt**. Sheep are grabbed,
  netted, bagged and beamed up, always gently (it is the law), and can be rescued until they
  leave the map. Scared sheep run and recover, exactly as now.
- Enemies are never killed on screen: they poof and are deported. A DEPORTED stamp is the
  kill confirmation.
- The joke stays on Gafoop, the Hegemony and the rivals, never on the sheep.

### 3.5 New cast: the claimants

| Claimant | Who | What they send |
|---|---|---|
| **The Grabulon Repossession Agency** | Goo-based debt collectors who repossess planets for a living | Gloops (blobs that carry sheep in threes), repo-bots, saucers. Boss: the Repo Mothership |
| **Vexx's Wolfworks** | A rival general who read *Little Red Riding Hood* and drew the obvious conclusion | Robot wolves that cut stragglers out and drive them off. Boss: the Big Bad Wolf 9000, which huffs and puffs (a wind that scatters the flock) |
| **The Shearing Syndicate** | Only want the wool ("it's soft") | Shearlings that steal fleece (experience) instead of sheep |
| **Bureau Bailiffs** | Gafoop's own Hegemony, collecting on his unpaid fines | Armoured bailiffs that go for Gafoop himself and pin him down |
| **Leftover human machines** | Still running on schedule | Hazards, as now: car alarms, sprinklers, the robot lawnmower. Late boss: the self-checkout (§9.1) |

### 3.6 Almanac samples

> **A FARM ON ZORBLAX 9.** Where sheep go when they are taken from Earth. By every account it
> is a very nice farm, with a great deal of grass and nobody shouting. The Almanac is aware of
> how this sounds, and has checked.

> **STATIONERY.** Writing materials and office supplies. Under §3 of the Code, an invader whose
> invasion has been ruled illegal may not bear arms, but may bear stationery. General Gafoop
> has requested a stapler with a longer range.

> **DEPORTATION.** The Bureau's remedy for claimants who touch protected property. Instant,
> mostly painless, and billed to the claimant. The smoking shoes are returned by post.

---

## 4. Core loops

**Seconds.** Move Gafoop; weapons fire on their own. Read the edges: who is going for the
flock? Turn back to break a grab, sweep through the flock to collect wool, pick up a stray.

**A run (15–20 minutes).** Start with a handful of sheep in a meadow. Enemies ramp up minute by
minute. Wool and salvage fill the requisition bar; each level-up is a pick of three. Lead the
flock to fresh grass when a field is grazed bare (that is when it is most exposed). Elites drop
supply crates; crates after minute 10 can hold an evolution. A boss arrives near the end. When
the timer runs out the Bureau reconvenes, every enemy is deported, and your sheep are counted.

**Between runs.** Wool banked buys permanent upgrades from Blorp's Requisition Catalogue.
Forms (goals such as *hold 50 sheep at once*) unlock new gadgets, breeds, characters and
regions. Each region is a stage with its own claimants and boss.

---

## 5. The herd

### 5.1 Herding, calling and guarding

Gafoop moves with one stick (or WASD). **His presence is felt**, as it was in the valley before
the Woof-Woof: sheep move off as he comes, more the faster he closes, and settle once he keeps
his distance. So he herds from behind, as a sheepdog does, and a careless flight through the
flock scatters it. There is one held button, **the bucket**: while it is held he is mostly
forgiven, and sheep within the call radius come to him and follow at a walk. So a run has two
rhythms: **guarding** (flock parked on grass, Gafoop circling it, which also keeps it bunched)
and **droving** (moving the flock to a shearing booth, fresh grass, a stray or away from a boss,
slower and more exposed). They are the two jobs real sheepdogs alternate, collecting stragglers
and driving the gathered flock (§2.4), so the rhythm is the true one.

S0 first shipped with a harmless Gafoop (the valley's M2b rule), a bucket to lead and a test
setting for a flock that always follows him loosely, like a bell-wether. The first playtest
found a Gafoop the flock ignores confusing (§11.2), so proximity is back and the always-follow
setting is gone.

### 5.2 The flock is the health bar

- The run is lost when the last sheep is taken. There is no other fail state.
- The sheep count is the largest number on the HUD, with +/− floaters.
- **A ladder, not a cliff.** Losing a sheep takes several steps, and every step but the last
  can be undone (the pattern of ICO, Resident Evil 4 and Defense Grid, §2.4):
  1. **Wool is a cushion.** A sheep with at least half a fleece cannot be grabbed: the first
     grab tears the fleece off instead, the tufts scatter (pick them up within a few seconds and
     the experience is still yours) and the sheep bolts. So wool is the flock's income and its
     armour at once, and damage costs economy before it costs sheep, as coins do in Kingdom and
     rings in Sonic.
  2. **Grab.** A bare sheep can be grabbed (0.5–2 s, longer with Thick Fleece) and carried towards
     the nearest map edge or its claimant's dropship, slowly. Small Gloops need three to lift
     one. A carried sheep shows a "!" and, off screen, an edge arrow.
  3. **Rescue.** Kill the carrier (or hook it with the crook) and the sheep drops, dazed for a
     second, then runs back to the nearest group.
  4. **Lost.** Only a sheep carried off the map is gone.
- This is the game's comeback valve and its main telegraph: losses are slow, visible and
  interruptible, never an off-screen number going down. Whether the wool cushion reads clearly
  enough is an S0 question (§11).

### 5.3 Growing the flock

| Source | How | Why it matters |
|---|---|---|
| **Strays** | Groups of 2–8 sheep scattered over the map, shown at the screen edge. Reach them and they join (the bucket helps) | Pulls Gafoop out across the map, like chests and pickups in Vampire Survivors; a stray group far from the flock is a risk/reward choice |
| **Lambs** | Calm, fed ewes have lambs now and then (more with Lambing Season) | Growth that compounds with a well-kept flock |
| **Rescues** | Rival pens on the map hold captured sheep; break the pen | Map events and elite fights with a reward you can see |
| **Level-ups and crates** | "+5 sheep" when the pool is exhausted; some crates contain sheep | A safety net against the death spiral |

A bigger flock is more experience and stronger herd gear, and also a bigger target. The
director (§7.2) sends more grabbers as it grows, so growth is always a trade. The performance
cap (§10.2) sets the ceiling: about 200 sheep on a phone.

A few sheep are individuals: a named bell-wether in every flock, rams, the black sheep, lambs
following their mothers. Herdling keeps its herd near ten so each animal matters (§2.4); a flock
of a hundred cannot do that, but a handful of named sheep in it can, and losing one of them
gets a line of its own.

### 5.4 Wool is experience, taken in at the booths

Sheep grow wool while fed and calm (about 40 s for a full fleece; slower when frightened, as in
the valley). Gafoop cannot shear. The Bureau has put **shearing booths** about the map (four in
the S0 meadow): a raised board under a canopy, with a ring on the grass at its mouth. A sheep
with at least a third of a fleece that stands in the ring is called up onto the board, shorn
and let off at the side, **one at a time** (a second and a bit each), and its wool flies to
Gafoop. Getting the flock there is the work: drive it in from behind, or call it with the
bucket, then keep the monsters off while the queue goes through. A sheep on the board is out of
reach of grabbers and saucers.

A shorn sheep has no cushion (§5.2) until its fleece is back past half, so every trip trades
the flock's armour for experience: shear when the field is quiet, or keep the wool on through a
rush. Fleece torn off by a grab still counts if the tufts are picked up. Enemies drop salvage
when deported. Wool and salvage fill the same requisition bar.

This is the line that makes the flock an asset, not a liability: early levels come from
kills, mid-run levels mostly from wool, and a scared, hungry or shrinking flock levels you
slower. The Shearing Syndicate steals fleece directly, so their targets are your income.

### 5.5 Grazing pressure

The grass field from the valley (`src/sim/grass.ts`) carries over. A parked flock grazes its
patch down (30 sheep strip a patch in two or three minutes); hungry sheep grow no wool and
start to drift off to graze on their own, which makes stragglers, which is what the wolves
hunt. So the flock has to be moved, and moving it is dangerous. This does for the herd what
being surrounded does for the player in Vampire Survivors: it keeps the action travelling
across the map. It is also the most expensive and least proven idea here, so it can be
switched off for S0.

### 5.6 What the flock model already gives us

- **Fear spreads by line of sight**, so a monster bursting into the flock sets off a stampede,
  and a stampede scatters sheep into the path of more monsters. Herd upgrades that calm the
  flock are worth taking.
- **Groups** (`group` in the contract) tell enemies which sheep are stragglers. Wolves pick the
  sheep in the smallest group farthest from the rest, which teaches *keep the flock tight*
  without a tutorial.
- **Threats push sheep.** Wolves need no special code to cut a sheep out: they are threats
  driving it away from the flock, the sheepdog in reverse.
- **Fences and walls** stop sheep and block panic. Ruins and drystone walls on the map are
  shelter worth driving the flock to, but they cover a flank, never all round: a flock that
  can be shut away safely stops the game, which is why the Resident Evil 4 remake took away
  Ashley's hiding places (§2.4). Diggers that tunnel in can come later if turtling appears.

### 5.7 Camera and readability

The camera frames Gafoop and the flock's centre (weighted towards Gafoop), steps out a zoom
level as the flock spreads, and stops rotating during runs (stick controls and four rotations
do not mix). Off-screen sheep that are grabbed get edge arrows. Grabbed sheep get a "!" and a
tint; enemies carrying sheep get an outline. Projectile effects are kept small and warm so the
white flock always reads.

---

## 6. Gafoop

- **Movement**: hover-disc, ignores terrain, faster than any sheep, slower than wolves late on.
- **Composure**: three pips. A hit costs one and gives a moment of invulnerability; pips come
  back after a few seconds without a hit. At zero, Gafoop is knocked out for four seconds (stars,
  spinning cap): weapons stop and the flock is on its own. Being surrounded therefore still
  matters, without a second fail state.
- **Presence**: sheep move off as he comes (§5.1); he herds by where he flies.
- **The bucket**: hold to call (§5.1). On a phone: stick on the left thumb, BUCKET on the right,
  as the valley's FEED button already works.
- **Pickup reach**: the radius in which salvage and tufts fly to him (the genre's magnet stat).

---

## 7. Monsters and spawning

### 7.1 Archetypes

Each archetype answers one question about the flock. Targets are chosen per archetype, so the
pressure is not all on Gafoop.

| Enemy | Claimant | Targets | Behaviour | Counter |
|---|---|---|---|---|
| **Gloop** | Grabulon | Nearest sheep (or Gafoop if closer) | Slow swarmer; three lift a sheep and waddle off with it | Area weapons; any hit drops the sheep |
| **Repo-bot** | Grabulon | Nearest sheep | Solo carrier, sturdier, carries fast | Single-target weapons, the crook |
| **Saucer** | Grabulon | Densest cluster | Parks over the flock; a ground ring warns for 2–3 s, then a tractor beam lifts a sheep over 3 s. Wool is no cushion against a beam | Burst it before the lift; beamed sheep fall if it pops |
| **Robot wolf** | Wolfworks | Straggler (smallest, farthest group) | Fast flanker in packs; a howl warns; drives a sheep away as a threat, no grab needed | Keep the flock tight; Bellwether; turn back fast |
| **Shearling** | Syndicate | Woolliest sheep | Steals fleece (experience, and the sheep's cushion), then runs | Kill before it leaves; shear first |
| **Bailiff** | Bureau | Gafoop | Armoured, slow, pins Gafoop (drains composure) | Kite; heavy weapons |
| **Ram-raider** | any | Flock centre | Charges through the flock to split it | Sidestep; Ram Horns; walls |
| **Netter** | any | Sheep at range | Fires nets that hold a sheep in place for a carrier | Kill the netter; Ear-Tag Zappers |
| **Elites** | any | as base | Bigger, glowing outline; drop a supply crate | Everything |
| **Bosses** | per stage | varies | §9.1 | — |

### 7.2 Spawning: a timeline plus a director

Two layers, both data-driven per stage:

1. **The timeline** (Vampire Survivors' model): per minute, an enemy pool with weights, a
   minimum number alive, a spawn interval, and scripted events (a ring of Gloops closing on the
   flock, a saucer squadron, a wolf pincer, an elite, the boss). This is the authored shape of
   the run and the main tuning surface.
2. **The director** (Risk of Rain 2's model, small): spawn credits per second grow with time
   and with **flock size**, and buy extra enemies from the current pool. It is what makes a big
   flock attract more grabbers, and it alternates **pressure** with short **breathers** (fewer
   spawns for 10–15 s every couple of minutes) so a scattered flock can be gathered back.
   After heavy losses it eases off for a while, as RimWorld's raids do (§2.4).

One hard rule on top of both: **no more sheep can be carried at once than about one in eight
of the flock** (never fewer than two). Grabbers beyond that go for Gafoop instead. One bad
moment cannot take the whole flock, the way Thronefall caps what one night can cost.

**Stage 1, The Valley, first draft** (numbers are starting points for the harness, §10.4).
Stage 1 is led by the Grabulon agency and introduces one archetype from each other claimant
late on, so S1 has all six to tune:

| Minute | Pool (new in bold) | At least alive | Spawn every | Events |
|---|---|---|---|---|
| 0–1 | **Gloop** | 6 | 2.0 s | A stray group in view. Gloops go for Gafoop in the first minute, so moving and shooting come before protecting |
| 1–2 | Gloop | 12 | 1.6 s | — |
| 2–3 | Gloop, **Repo-bot** | 18 | 1.4 s | First grab; Blorp names it |
| 3–4 | + **Saucer** (one at a time) | 24 | 1.2 s | First beam; Blorp names it |
| 4–5 | Gloop, Repo-bot, Saucer | 30 | 1.1 s | **Gloop ring**: a circle of Gloops closes on the flock |
| 5 | | | | **Elite** Big Gloop: the first crate |
| 5–7 | + **Robot wolf** (packs of 4) | 40 | 1.0 s | A howl before each pack |
| 7–8 | *breather* | 15 | 2.5 s | Lambs; a rival pen of captured sheep to break open |
| 8–10 | + **Shearling** | 55 | 0.8 s | **Saucer squadron**: three at once |
| 10 | | | | Elite; from now on crates can hold evolutions |
| 10–12 | + **Bailiff** | 70 | 0.7 s | **Wolf pincer** from two sides |
| 12–13 | *breather* | 25 | 2.0 s | — |
| 13–14 | everything | 90 | 0.5 s | **Thunderstorm**: lightning startles set off stampedes |
| 14 | | | | **Boss**: the Repo Mothership |
| 15:00 | | | | **The hearing** (§7.5) |

### 7.3 Where they spawn

- On a ring just outside the visible area, never on screen and never within a set distance of
  any sheep.
- **Gafoop-hunters** spawn ahead of where he is moving (the genre default).
- **Sheep-hunters** spawn on the side of the flock away from Gafoop. That one rule is what makes
  him orbit the flock like a dog instead of fleeing in a line.
- **Groups that arrive in view** (saucers coming down, the Gloop ring, a dropship unloading)
  are marked on the ground a second or two ahead, as Brotato marks its spawns, and if Gafoop is
  standing on a mark the group lands somewhere else. Blocking a landing becomes part of
  guarding.
- Enemies left far behind both Gafoop and the flock are moved back onto the ring rather than
  despawned, so the pressure stays without a cap being wasted.
- Caps by device tier: about 300 enemies on desktop, 200 on phones (§10.2).

### 7.4 Telegraphs and fairness

Every way of losing a sheep has a warning and a window: an edge arrow for any grab off screen, a
ground ring before a beam, a howl before a wolf pack, a deep breath before the Big Bad Wolf
huffs, a "!" over every carried sheep, and the carry itself (slow, all the way to the map
edge). The models are Plants vs Zombies' Bungee Zombie (mark, yell, three seconds to act) and
Pikmin's Puffy Blowhog (it breathes in first). The first time each archetype appears, Gafoop or
Blorp names it in a bark. A sheep is never lost to something the player could not see.

### 7.5 The end of a run

- **The hearing.** At the timer, the Auditor's hologram appears over the field, the gavel falls,
  every enemy is deported at once, and the flock is counted. Sheep held is the score; holding
  at least one wins the region.
- **Appeal court** (endless). Choose to keep going and the Bureau "adjourns for lunch". The
  **Tax Inspector** arrives, the genre's unbeatable Reaper: very slow, almost unkillable,
  takes a sheep every few seconds. It ends every run eventually and makes high-score runs a
  matter of how long you can stretch it.

---

## 8. Level-ups and upgrades

### 8.1 The requisition bar

- **Sources**: wool from the shearing booths and from torn fleeces (a full fleece is worth 3)
  and salvage from deported enemies (a Gloop 1, a Repo-bot 2, an elite 20). Pickup reach pulls
  in what lies about.
- **Curve**: Vampire Survivors' shape, scaled to a shorter run. Level *n* → *n*+1 costs about
  5 + 8(*n*−1) to level 20, then a one-off bump and a steeper slope, because by then the flock's
  wool is most of the income. The constants are the harness's to tune; the targets are the
  cadence: **a level every 10–15 s in the first minutes, every 30–40 s by minute 8, every
  45–60 s at the end**, about 25 level-ups in a 15-minute run and 35 in a 20-minute one.
- **Too many pickups**: past about 150 on the map (less than the genre's 400, for phones), new
  ones merge into the nearest large tuft, so nothing is lost and nothing clutters.
- **Pausing.** Vampire Survivors pauses for every level-up; Brotato saves the choices for
  between waves, which interrupts play less. On a phone the second may play better: level-ups
  bank as *supply drops waiting*, opened with a tap or at the next breather, with the game
  pausing only while a card is being picked. S0 tries both.

### 8.2 The choice

- Pick one of **three** cards (four with enough Bureau Connections, the luck stat).
- Cards come from: new items for empty slots, the next level of owned items. Rarer items are
  weighted down; luck evens the odds.
- **Reroll, skip and banish** charges are bought between runs, not given (genre standard).
- When everything is maxed, the cards are *+3 sheep*, *restore composure* and *a bag of salvage*.
- Phone layout: three large cards across the bottom half, big enough for a thumb.

### 8.3 Slots

**Five armaments + five provisions.** Armaments are anything that does damage, whether Gafoop
carries it or the flock wears it; provisions are passive stats, for Gafoop or for the flock.
Sharing the slots between Gafoop and the herd is deliberate: every pick is a choice between
building up yourself and building up the flock. Armaments go to level 6, provisions to level 4,
so a run cannot max everything and the picks matter. (The genre's six and six, with weapons to
level 8, suits Vampire Survivors' hundred-odd level-ups in half an hour; with 25–35 level-ups,
fewer slots and shorter tracks keep the build growing to the end.)

### 8.4 First catalogue

**Gafoop's stationery** (armaments he carries):

| Item | Does | Evolves with → into |
|---|---|---|
| **Rubber Stamp** (starter) | Slams APPROVED round Gafoop every 2 s; damage and knockback | Medal of Excessive Merit → **Seal of the Hegemony**: stamps leave burning DENIED marks |
| **Stapler** | Staples the nearest enemy; more staples per level | Expedited Processing → **Industrial Staple Gun**: a piercing stream |
| **Paper Shredder** | Orbiting blades | Triplicate → **Document Destruction Unit** |
| **Red Tape** | Lays tape behind Gafoop that slows and snags | Bureaucracy → **Kafka Field**: snagged enemies are filed (frozen) |
| **Paper Planes** | Homing forms that seek the enemy **nearest a sheep** | Bureau Connections → **Form 77-B in Quintuplicate** |
| **Herding Crook** | Sweep in the direction of travel; yanks carried sheep free | Long Reach → **Crook of Office**: both sides, frees every sheep in the arc |
| **Hole Punch** | Slow, heavy hit on the biggest enemy in range | Bigger Cap → **Black Hole Punch**: pulls enemies in first |
| **Filing Cabinet** | Blorp drops cabinets from orbit on the thickest crowd | Orbital Clearance → **Archive Avalanche** |
| **Woof-Woof 3000** | A bark: knocks enemies back, and also bunches the flock (scared sheep grow less wool) | Clockwork Collie → **The Hound of the Baaskervilles**: a spectral hound circles the flock barking enemies away, without scaring a single sheep |

**Herd gear** (armaments the flock wears; they scale with flock size, which is the point):

| Item | Does | Evolves with → into |
|---|---|---|
| **Bell Collars** | Collared sheep ring a small shockwave every few seconds; levels collar more sheep | Bellwether → **Carillon**: the bells ring in order across the flock, a rolling wave |
| **Static Wool** | Sheep close together arc lightning between them, hitting enemies on the line; a dense flock is a lightning net | Merino Genes → **Thunderfleece** |
| **Ram Horns** | Some sheep become rams, which butt any enemy that comes too close (as rams do) | Stubborn Breed → **Battering Rams** |
| **Punk Shearing** | Spiky wool: contact damage to anything that grabs, longer grabs | Thick Fleece → **Hedgehog Cut**: fires quills when grabbed |
| **Ear-Tag Zappers** | Blorxian tags zap whatever grabs a sheep | Calm Disposition → **Diplomatic Immunity**: the first grab on each sheep fails and the grabber is deported |
| **Clockwork Collie** | A brass dog (built from pictures) circles the flock, nipping enemies and turning stragglers back | (pairs with the Woof-Woof, above) |
| **Fleece Flak** | Startled sheep shed tufts that pop | Sure-footed → **Popcorn Panic**: every stampede is a bombardment |

**Provisions**:

| For Gafoop | Effect | For the flock | Effect |
|---|---|---|---|
| Turbo Disc | Move speed | **Thick Fleece** | Grabs take longer; the fleece cushions from a third grown |
| Long Reach | Pickup radius | **Bellwether** | Tighter flock, fewer stragglers |
| Electric Shears | The shearing booths work faster | | |
| Medal of Excessive Merit | Damage | **Calm Disposition** | Fear spreads less, settles faster |
| Expedited Processing | Cooldowns | **Merino Genes** | Wool grows faster (more experience) |
| Triplicate | Projectile count | **Lambing Season** | More lambs |
| Bigger Cap | Area | **Sure-footed** | Sheep run faster when fleeing and when called |
| Bureaucracy | Duration | **Stubborn Breed** | Chance to kick free of a grab |
| Bureau Connections | Luck | **Homing Instinct** | Dropped and stray sheep run back faster |
| Composure Training | Composure pips | Good Grazing | Hunger slower, grazing faster |
| Orbital Clearance | Crate quality | | |

That is 16 armaments, 20 provisions and 15 evolutions: more than S1 needs (§11 picks a subset).

### 8.5 Supply crates

Elites drop crates. A crate holds one upgrade, sometimes three or five (luck). From minute 10,
a crate can hold an evolution if its recipe is met (a maxed armament plus its provision). Some
crates hold sheep instead.

---

## 9. Runs, stages and meta-progression

### 9.1 Stages (regions of Earth)

| Stage | Map | Lead claimant | Boss | Length |
|---|---|---|---|---|
| 1. **The Valley** | The meadow, enlarged: open grass, a few walls, a river | Grabulon | The Repo Mothership (the intro's mothership: tows sheep up in batches) | 15 min |
| 2. **The Downs** | Chalk hills, a white horse, hedgerows (cover, but blocks sight) | Wolfworks | The Big Bad Wolf 9000 (breathes in, then huffs and puffs: a wind that scatters the flock and blows fences down) | 20 min |
| 3. **Motorway Services** | Ruins, a car park, leftover machines (car alarms start stampedes) | Syndicate | The Golden Shears | 20 min |
| 4. **The Supermarket** | Aisles (corridors), freezers | Bureau Bailiffs | **The Self-Checkout**: *Unexpected sheep in bagging area*. The microwave burrito is its last item | 20 min |

Stage 1 is the S1 target; stages 2–4 are content milestones.

### 9.2 Characters and breeds

A run is chosen as a **character** (Gafoop, later Lieutenant Blorp, a Clockwork Collie, the
Auditor's hologram), each with a starting armament and a small bonus, and a **breed** for the
flock, which sets the herd's traits. Breeds come from DESIGN §4.3: Common Meadow (balanced),
Merino (more wool, slower, very tight), Herdwick (spreads out but finds its own way back),
Jacob (horned, hard to grab, stubborn), Suffolk (fast), Black Sheep (one contrary sheep per
ten; more experience, more stragglers). Character × breed gives the run its identity cheaply.

### 9.3 Between runs

- **Wool banked** at the end of a run (wool collected, times a bonus for sheep held) is the one
  persistent currency.
- **Blorp's Requisition Catalogue** sells permanent upgrades: starting sheep, damage, shearing
  reach, composure, rerolls, skips, banishes, and one **Appeal** per run (when the last sheep is
  taken, five strays are beamed in).
- **Forms** are the unlock goals, on the clipboard the valley already has: *Form 14-C: hold 50
  sheep at once* (unlocks Bell Collars), *Form 22-A: rescue 100 sheep* (unlocks the Crook),
  *Form 31-D: survive a stampede with no losses* (unlocks Calm Disposition). The pool of items
  starts small and grows through Forms, so the first runs are simple and every unlock is new.
- **The Almanac** gains an entry for every enemy, item and breed met.

---

## 10. Technical plan

### 10.1 Reuse, set aside, build

| | |
|---|---|
| **Reuse as is** | Pixel renderer and toon pipeline, palette, fonts, UI panels, audio engine, SFX and music, voice pipeline, intro system and movie export, art primitives (sheep, Gafoop, saucer, mothership, pod, props, puffs), sheep instancer, flock model behind the contract, grass field and grass view, phone controls, loading steps, perf test, headless screenshot tool |
| **Set aside** (kept in code, out of the menu) | `src/works/` (devices, stations), build mode, races and flaps, flow overlay, the valley's Forms |
| **Change** | Camera (fixed yaw in runs, framing Gafoop and flock), HUD (sheep counter, timer, requisition bar, slots), Forms (become unlock goals), menu (run setup) |
| **Build** | `src/run/`: run state and timer, director and stage tables, enemy sim, weapons and projectiles, pickups, level-up screen, crates, meta save; enemy art and an enemy instancer |

### 10.2 Performance

Measured on this branch's container (desktop-class CPU, Node), `sheepherding-v1` per 30 Hz tick:

| Sheep | Threat stimuli | ms per tick |
|---|---|---|
| 100 | 20 | 1.7 |
| 200 | 20 | 2.2 |
| 400 | 20 | 4.6 |
| 800 | 20 | 10.2 |
| 200 | 100 | 5.0 |
| 200 | 300 | 11.7 |

So the flock itself scales fine to a few hundred sheep, but **every stimulus is checked by every
sheep**: 300 monsters passed in as threats would cost five times the flock. Two fixes, both
inside the model: bucket stimuli on a grid so a sheep only looks at nearby ones, and send the
flock only the enemies near it (most enemies are just bodies to the flock until they are
close). Target: 200 sheep and 300 enemies at under 3 ms per tick on desktop, which leaves room on
a phone (3–4× slower) inside a 33 ms tick.

The enemies themselves do not use the flock model. They are a separate, cheap
structure-of-arrays sim: seek a target, separate from neighbours on a spatial hash, avoid fences
with the same segment grid the flock uses. Target: 300 enemies under 1 ms. They render like the
sheep, one instanced mesh per part.

Caps by device tier, chosen at start-up from the perf test's numbers: phones about 200 sheep
and 200 enemies, desktop 300 and 300.

### 10.3 Contract changes

The contract (`src/sim/contract.ts`) gains what the run needs, and nothing reaches past it:

1. **A changing population** ✅ (S0), done more simply than first planned: every sheep a run
   will have is in the model from the start, and `hold(i)`, `place(i, x, y)` and `release(i)`
   take one out of the flock and put it back. A held sheep stays where the game puts it and is
   out of every other sheep's sight, grid and group, so strays wait where they graze, spares
   wait off the field, and a carried sheep goes where its carriers go, over the wall included.
   Indices never change.
2. **A stimulus grid** ✅ (S0) inside the model, invisible to the game: threats bucketed by
   their lookahead point, each sheep weighing only those that could reach it, in list order, so
   the flock is bit-identical to the plain loop. 200 sheep among 300 threats: 12.1 ms a step
   before, 3.0 after.
3. **Tests** ✅ (S0): a held sheep stays put and is not missed, a carried one goes through fences
   and past the edge of the world, one let go far away walks back, and many threats give the
   same flock as the plain loop. Still to come: a wolf cutting a straggler out (S1).

### 10.4 Testing and balancing

- Unit and scenario tests (Vitest), as now: the director spawns within the minute's limits,
  killing a carrier drops its sheep, crates obey evolution rules, a run is deterministic from a
  seed.
- **A headless run harness**: the whole run sim without rendering, played by a scripted bot
  (the valley already has a scripted shepherd in `tools/game-shot.mjs`). It runs dozens of
  15-minute runs in seconds and graphs flock size, enemies alive, experience per minute and
  level-ups over time. Balancing is done against those graphs, then by hand.
- The existing on-device perf test grows a "run" scene: 200 sheep, 200 enemies, projectiles.

---

## 11. Milestones

| Milestone | Goal | Exit criteria |
|---|---|---|
| **S0: Find the fun** 🟡 built (§11.1), changed after the first playtest (§11.2) | Greybox in the existing engine: the meadow, 8 sheep, Gafoop with the stamp and the stapler, Gloops and saucers, grabbing and rescue, wool as experience, a level-up screen with about eight items, strays, a 10-minute run, lose at zero sheep. Two builds, bucket-to-lead and always-follow; toggles for the wool cushion (§5.2), grazing (§5.5) and banked level-ups (§8.1) | Testers ask for another run; protecting feels like being a sheepdog, not babysitting; every lost sheep was seen being lost; it runs at 50 fps on a phone with 100 sheep and 150 enemies |
| **S1: Stage 1** | The Valley as a full 15-minute stage: timeline and director, six archetypes, 8 armaments, 10 provisions, 3 evolutions, crates, elites, the Repo Mothership, the hearing, grazing (if S0 kept it), contract v2, the run harness, an effects-opacity setting | A full run on an iPhone at ≥ 50 fps with 150 sheep and 200 enemies; harness graphs show a level-up every 15–25 s early and every 40–60 s late; median first run ends after minute 8 |
| **S2: Between runs** | Wool banking, the Requisition Catalogue, Forms as unlocks, three breeds, a second character, the Almanac, appeal court and the Tax Inspector | A new player meets a new item or breed in each of their first ten runs |
| **S3: The story** | The revised intro (new lines, the saucer and crate beats), hearing cutscenes per stage, barks for every first meeting, music that layers with the pressure | The intro hands over into the first run with no menu in between |
| **S4: Content** | Stages 2–4 and their bosses, the full catalogue, accessibility (screen shake, colour-blind outlines), balancing | Each stage cleared by a tester within ten attempts |

S0 is the decision point: if protecting a flock is not fun in the greybox, nothing later fixes it.

### 11.1 S0 as built

**Hold the Flock** is this branch's game (the start screen's PLAY, or `?game`; the README has
the controls). What is in it:

| Planned | Built |
|---|---|
| The meadow, 8 sheep, strays | The valley's meadow, walled; 8 sheep, four stray groups and a new one every 75 s (never more than four waiting) |
| Gafoop with the stamp and the stapler | The stamp to start with; the stapler, shredder and crook as level-ups; composure (three pips, a knockout) |
| Gloops and saucers, grabbing and rescue | Both, plus a big Gloop (minutes 5 and 8) that carries alone and drops a crate. One Gloop pins a sheep, three carry it; carriers head over the nearest wall; deport or hook them and it drops back. The take cap (one in eight) |
| Wool as experience | Four shearing booths that take woolly sheep in one at a time (§5.4; Gafoop sheared full fleeces as he passed until the first playtest), salvage from kills, one bar |
| About eight items | Twelve: four stationery, two flock gear (bell collars, static wool), six provisions; five and five slots |
| A 10-minute run, lose at zero sheep | The minute table and the director (§7.2) over ten minutes, the hearing at 10:00 |
| Two builds: bucket-to-lead and always-follow | One build with the test settings on the title, pause and results screens: wool cushion, grazing, banked level-ups (a lead-mode setting went with the first playtest: Gafoop's proximity moves the flock, the bucket calls it) |

Not in S0: evolutions, robot wolves, shearlings and bailiffs (S1), the revised intro (S3; the
intro still tells the old story), meta-progression (S2).

**What the harness said** (as first built, before §11.2; a bot that rescues first, fetches
strays and circles the flock; 3 seeds): it holds 12-35 sheep to the hearing at level 19-21 and loses 0-1 along the way; wool is
about 35-50% of the experience. A Gafoop who never moves loses the whole flock between minutes
4 and 7, so play matters. Tuning so far: a fleece is worth 10 and a Gloop 0.6, so the flock
earns about as much as the killing; hunger runs at half the valley's rate (with grazing on and
monsters about, frightened sheep do not graze, and a hungry sheep grows no wool); the opening is
gentler (stamp every 1.5 s, fewer Gloops in the first two minutes).

**Performance.** At the S0 check load (108 sheep, 107 monsters after the stress button) a step
takes about 4 ms on a desktop CPU, of which the flock model is about 3.2; ordinary play is well
under half that. On a phone that is roughly three to four times as much, so 50 fps with 100
sheep and 150 monsters is plausible but not certain; the F readout and its stress button are
there to find out.

**What the playtest should answer**, in order: does protecting feel like being a sheepdog or
like babysitting? Is every lost sheep seen being lost? Which lead mode is better (answered:
neither, §11.2)? Does the wool cushion read without being told? Is grazing a decision or a
chore? Do banked level-ups suit a phone better? And the frame rate at the stress load.

### 11.2 After the first playtest

Two notes came back from the first play, and both are in:

1. **"Gafoop should not shear the sheep. Put stations about the map that the sheep are brought
   to, and that shear them one by one."** Shearing is the booths' now (§5.4):
   - Four Bureau shearing booths stand in the meadow (`src/run/field.ts`), each a board under a
     red canopy, with a ramp up from its mouth (which faces the middle of the meadow) and one
     down at the side.
   - A flock sheep with at least 0.3 of a fleece inside the ring at the mouth (5 m round a point
     3 m in front of the board) is called in. It hops up (up to a second, by how far it was), is
     shorn while its fleece visibly shrinks (0.7 s) and hops off at the side (0.35 s), and the
     next is called as it goes. The wool, worth the same as before (10 a full fleece), flies to
     Gafoop wherever he is.
   - On the board a sheep still counts as his, and cannot be grabbed or marked by a saucer.
   - Long Shears (pickup and shearing reach) became **Electric Shears**: the booths work 30%
     faster a level. The pickup radius no longer grows.
   - The HUD draws each booth's ring (on the grass it would vanish into the grass). When 40% of
     the flock is woolly an arrow at the screen edge points to the nearest booth, and if the
     flock is woolly at 0:45 and has not been near one, Gafoop says so.
2. **"It is confusing that the player cannot affect the sheep just by proximity. Bring that
   back."** Gafoop is a threat stimulus again, as in the valley before M2b (§5.1):
   - 0.6 over 6 m. The valley's 0.85 over 9 m drove the flock into a wall each time he flew at a
     monster beside it; he is always flying about here.
   - With the bucket held, 0.2 over 4 m, plus the bucket's call (1.0 over 14 m). The gentler push
     has a side effect: the bucket now leads (the flock follows at a walk, about a metre a
     second), where before it barely did.
   - The always-follow lead setting is gone.

The harness's bot herds now: it drives the flock from behind into the nearest booth when half
of it is woolly, keeps driving through fights (only a grab breaks it off), drives straggling
groups back, and otherwise circles the flock outside its flight zone. Over six seeds it holds
13-25 sheep to the hearing at level 13-18, loses 3-16 on the way (it lost 0-3 before) and
shears 5-19 fleeces, so wool is about a quarter of its experience (it was 35-50%). Its booth
trips are clumsy; a player should do far better, and the playtest will say how much. If wool
falls short for people too, the levers are the booths' count and ring size, the fleece's worth,
and the push.

Still open: whether 0.6 over 6 m is the right push; whether four booths are enough, and in the
right places; and whether sheep-hunters should keep coming in on the flock's far side from
Gafoop (§7.3), which now means head-on into a flock he is driving. The harness could not tell
that rule from random directions.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| **The escort-mission problem**: the flock feels like a liability | It is the experience engine and a weapon platform (§5.4, §8.4); losses are reversible; strays and lambs refill it; S0 tests this before anything else |
| **Death spiral**: fewer sheep, less experience, fewer sheep | Wool takes the first hit (§5.2); no more than one sheep in eight can be carried at once and the director eases off after losses (§7.2); kills always pay; strays keep appearing; maxed level-ups give sheep; the Appeal |
| **Emergent chaos reads as unfair** | Telegraphs for every loss (§7.4), calm upgrades, the flock retuned a little less flighty for runs |
| **A clingy, passive flock** (Be My Horde's main complaint, §2.4) | Herd gear makes the flock act on its own; sheep flee and bunch by themselves; nothing needs babysitting out of scenery |
| **Frame drops in stampedes** (Herdling's) | A stampede scene in the perf test; the stimulus grid (§10.2) |
| **Clutter at 640×360** | Fewer, larger enemies than the genre's hordes; small warm projectiles; an effects-opacity setting; white sheep reserved for sheep |
| **Phone performance** | Measured budgets (§10.2), the stimulus grid, caps by tier, the perf test in every milestone's exit criteria |
| **Grazing is one system too many** | It can be switched off; S0 decides |
| **Losing what made Autosheep distinct** | The flock model is the selling point in both games; the branch takes only what works |
| **Scope** | S1 uses a third of the catalogue; content is data |

---

## 13. Open questions

| Question | Recommendation |
|---|---|
| Does the flock follow Gafoop by default, or only while the bucket is held? | Settled by the first playtest (§11.2): sheep move off as he comes, and come to the bucket |
| How strong is Gafoop's presence, and do monsters still come from the flock's far side now that he drives it from behind? | 0.6 over 6 m to start (the valley's was 0.85 over 9 m); the next playtest says (§11.2) |
| Is the flock the only fail state? | Yes, with knockouts for Gafoop (§6) |
| Run length | 15 minutes for stage 1, 20 after; phones may want a 10-minute mode |
| Does building survive (hurdles, pens)? | Not in S0. Later, possibly as deployable gear (a hurdle ring, a woof post) in the way Brotato has structures |
| Grazing pressure | Keep it if S0 shows it adds decisions, not chores |
| Wool as a cushion (§5.2) | Keep it if testers understand it without being told |
| Level-ups: pause each time, or bank them for a breather? | Prototype both in S0 (§8.1); banking may suit phones better |
| Does the automation game stay on main? | Yes; this branch is an experiment until S0 says otherwise |

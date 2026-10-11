# AUTOSHEEP: SURVIVORS — pivot plan

*Branch `claude/survivors-pivot` · October 2026 · proposal, nothing built yet*

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
| Gafoop | Harmless, leads with a bucket, builds | Fights with auto-firing stationery; still leads with the bucket |
| The flock | A logistics layer | The health bar, the XP engine and a weapon platform |
| Threats | Light hazards only | Waves of alien claim-jumpers who take sheep (never harm them) |
| Progress | Bureau Forms, Audits, eras | Level-ups in a run; Forms become unlock goals between runs |
| Reused | Renderer, art, audio, voices, intro, flock model + contract, grass, phone controls, perf tooling | All of it |
| Set aside | — | Building, stations, races, the works (kept in the code, out of the menu) |

### 1.3 Pillars

1. **Sheep are sheep** (unchanged). Sheep never fight, never decide, never understand. Gear on
   a sheep works by itself; the sheep does not notice it is wearing it. Every sheep reaction is
   the flock model: fear, following, bunching, grazing, panic.
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

*(Summary of the research; numbers and sources are in the research files.)*

*Pending: the two research reports are being finished; this section will summarise them and the
research files will hold the details.*

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
*hold the flock until the Bureau reconvenes. In twenty minutes.*

### 3.2 Every mechanic has a reason

| Mechanic | Why, in the fiction |
|---|---|
| Waves of enemies | Rival claimants and their hired acquisition crews, arriving from all over the sector |
| Enemies take sheep instead of hurting them | §42.7(b): the dominant species is protected. Nobody can sign a surrender if it is hurt |
| A lost sheep is gone for good (this run) | It has been taken off-world, to "a farm on Zorblax 9" (§3.6) |
| Gafoop's weapons are a stamp, a stapler, red tape | Exiled invaders may not bear arms. Nothing in the Code says anything about stationery |
| Defeated enemies vanish in a poof | They are deported by the Bureau, instantly, at their own expense. Cartoon poof, smoking shoes, as in the intro |
| The run timer | The time until the Bureau reconvenes. The intro's last frame becomes the first frame of the run: *THE BUREAU RECONVENES IN 20:00* |
| The flock grows | Sheep scattered everywhere after the invasion; nobody is left to farm them. More sheep, stronger claim |
| Level-ups | Blorp's supply drops, paid for in wool, which the Hegemony values "because it is soft" (DESIGN §6.4) |
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
| A06 | *Space travel. Nuclear power. The microwave burrito.* | **New:** *In twenty minutes.* |
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

Work: about eight new voice lines through the existing Kokoro pipeline
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

### 5.1 Leading and guarding

Gafoop moves with one stick (or WASD). There is one held button, **the bucket**, as in the
valley: while it is held, sheep within the call radius follow him. Released, the flock stays
where it is and grazes, and Gafoop is free to fight around it. So a run has two rhythms:
**guarding** (flock parked on grass, Gafoop circling) and **droving** (moving the flock to fresh
grass, a stray or away from a boss, slower and more exposed).

The alternative is a flock that always follows Gafoop loosely, like a bell-wether, with
nothing to press. That is simpler (pure one-stick play, closer to the genre) but turns the herd
into a snake's tail and makes kiting drag enemies through it. **S0 prototypes both** (§11);
the recommendation is bucket-to-lead, because guarding versus droving is where the decisions
are.

### 5.2 The flock is the health bar

- The run is lost when the last sheep is taken. There is no other fail state.
- The sheep count is the largest number on the HUD, with +/− floaters.
- **Grabs.** An enemy that reaches a sheep grabs it (0.5–2 s, longer with Thick Fleece), then
  carries it towards the nearest map edge or its parked dropship at reduced speed. Small Gloops
  need three to lift one. A carried sheep shows a "!" and, off screen, an edge arrow.
- **Rescue.** Kill the carrier (or hook it with the crook) and the sheep drops, dazed for a
  second, then runs back to the nearest group. A sheep is only lost when it leaves the map.
- This is the game's comeback valve and its main telegraph: losses are slow, visible and
  interruptible, never an off-screen number going down.

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

### 5.4 Wool is experience

Sheep grow wool while fed and calm (about 45 s for a full fleece; slower when frightened, as in
the valley). Gafoop shears automatically as he flies through the flock: a woolly sheep within
shearing reach drops a tuft, and tufts fly to him. Enemies drop salvage when deported. Both fill
the same requisition bar.

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
  shelter worth driving the flock to.

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
- **The bucket**: hold to lead (§5.1). On a phone: stick on the left thumb, BUCKET on the right,
  as the valley's FEED button already works.
- **Shearing reach**: the pickup radius for wool and salvage (the genre's magnet stat).

---

## 7. Monsters and spawning

### 7.1 Archetypes

Each archetype answers one question about the flock. Targets are chosen per archetype, so the
pressure is not all on Gafoop.

| Enemy | Claimant | Targets | Behaviour | Counter |
|---|---|---|---|---|
| **Gloop** | Grabulon | Nearest sheep (or Gafoop if closer) | Slow swarmer; three lift a sheep and waddle off with it | Area weapons; any hit drops the sheep |
| **Repo-bot** | Grabulon | Nearest sheep | Solo carrier, sturdier, carries fast | Single-target weapons, the crook |
| **Saucer** | Grabulon | Densest cluster | Parks over the flock; a ground ring warns for 2–3 s, then a tractor beam lifts a sheep over 3 s | Burst it before the lift; beamed sheep fall if it pops |
| **Robot wolf** | Wolfworks | Straggler (smallest, farthest group) | Fast flanker in packs; a howl warns; drives a sheep away as a threat, no grab needed | Keep the flock tight; Bellwether; turn back fast |
| **Shearling** | Syndicate | Woolliest sheep | Steals fleece (experience), then runs | Kill before it leaves; shear first |
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
- Enemies left far behind both Gafoop and the flock are moved back onto the ring rather than
  despawned, so the pressure stays without a cap being wasted.
- Caps by device tier: about 300 enemies on desktop, 200 on phones (§10.2).

### 7.4 Telegraphs and fairness

Every way of losing a sheep has a warning and a window: an edge arrow for any grab off screen, a
ground ring before a beam, a howl before a wolf pack, a "!" over every carried sheep, and the
carry itself (slow, all the way to the map edge). The first time each archetype appears, Gafoop
or Blorp names it in a bark. A sheep is never lost to something the player could not see.

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

- **Sources**: wool tufts (a full fleece is worth 3) and salvage from deported enemies (a Gloop
  1, a Repo-bot 2, an elite 20). Shearing reach pulls both in.
- **Curve**: Vampire Survivors' shape, scaled to a shorter run. Level *n* → *n*+1 costs about
  5 + 8(*n*−1) to level 20, then a one-off bump and a steeper slope, because by then the flock's
  wool is most of the income. The constants are the harness's to tune; the targets are the
  cadence: **a level every 10–15 s in the first minutes, every 30–40 s by minute 8, every
  45–60 s at the end**, about 25 level-ups in a 15-minute run and 35 in a 20-minute one.
- **Too many pickups**: past about 150 on the map (less than the genre's 400, for phones), new
  ones merge into the nearest large tuft, so nothing is lost and nothing clutters.
- Level-ups pause the game, as in the genre. Several in a row queue up and are taken one after
  another.

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
so a run cannot max everything and the picks matter.

### 8.4 First catalogue

**Gafoop's stationery** (armaments he carries):

| Item | Does | Evolves with → into |
|---|---|---|
| **Rubber Stamp** (starter) | Slams APPROVED round Gafoop every 2 s; damage and knockback | Medal of Excessive Merit → **Seal of the Hegemony**: stamps leave burning DENIED marks |
| **Stapler** | Staples the nearest enemy; more staples per level | Expedited Processing → **Industrial Staple Gun**: a piercing stream |
| **Paper Shredder** | Orbiting blades | Triplicate → **Document Destruction Unit** |
| **Red Tape** | Lays tape behind Gafoop that slows and snags | Bureaucracy → **Kafka Field**: snagged enemies are filed (frozen) |
| **Paper Planes** | Homing forms that seek the enemy **nearest a sheep** | Bureau Connections → **Form 77-B in Quintuplicate** |
| **Herding Crook** | Sweep in the direction of travel; yanks carried sheep free | Long Shears → **Crook of Office**: both sides, frees every sheep in the arc |
| **Hole Punch** | Slow, heavy hit on the biggest enemy in range | Bigger Cap → **Black Hole Punch**: pulls enemies in first |
| **Filing Cabinet** | Blorp drops cabinets from orbit on the thickest crowd | Orbital Clearance → **Archive Avalanche** |
| **Woof-Woof 3000** | A bark: knocks enemies back, and also bunches the flock (scared sheep grow less wool) | Clockwork Collie → **The Hound of the Baaskervilles**: a spectral hound circles the flock barking enemies away, without scaring a single sheep |

**Herd gear** (armaments the flock wears; they scale with flock size, which is the point):

| Item | Does | Evolves with → into |
|---|---|---|
| **Bell Collars** | Collared sheep ring a small shockwave every few seconds; levels collar more sheep | Bellwether → **Carillon**: the bells ring in order across the flock, a rolling wave |
| **Static Wool** | Sheep close together arc lightning between them, hitting enemies on the line; a dense flock is a lightning net | Merino Genes → **Thunderfleece** |
| **Ram Horns** | Some sheep become rams that charge enemies approaching the flock | Stubborn Breed → **Battering Rams** |
| **Punk Shearing** | Spiky wool: contact damage to anything that grabs, longer grabs | Thick Fleece → **Hedgehog Cut**: fires quills when grabbed |
| **Ear-Tag Zappers** | Blorxian tags zap whatever grabs a sheep | Calm Disposition → **Diplomatic Immunity**: the first grab on each sheep fails and the grabber is deported |
| **Clockwork Collie** | A brass dog (built from pictures) circles the flock, nipping enemies and turning stragglers back | (pairs with the Woof-Woof, above) |
| **Fleece Flak** | Startled sheep shed tufts that pop | Sure-footed → **Popcorn Panic**: every stampede is a bombardment |

**Provisions**:

| For Gafoop | Effect | For the flock | Effect |
|---|---|---|---|
| Turbo Disc | Move speed | **Thick Fleece** | Grabs take longer |
| Long Shears | Shearing reach (pickup radius) | **Bellwether** | Tighter flock, fewer stragglers |
| Medal of Excessive Merit | Damage | **Calm Disposition** | Fear spreads less, settles faster |
| Expedited Processing | Cooldowns | **Merino Genes** | Wool grows faster (more experience) |
| Triplicate | Projectile count | **Lambing Season** | More lambs |
| Bigger Cap | Area | **Sure-footed** | Sheep run faster when fleeing and when called |
| Bureaucracy | Duration | **Stubborn Breed** | Chance to kick free of a grab |
| Bureau Connections | Luck | **Homing Instinct** | Dropped and stray sheep run back faster |
| Composure Training | Composure pips | Good Grazing | Hunger slower, grazing faster |
| Orbital Clearance | Crate quality | | |

That is 16 armaments, 19 provisions and 15 evolutions: more than S1 needs (§11 picks a subset).

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
| 2. **The Downs** | Chalk hills, a white horse, hedgerows (cover, but blocks sight) | Wolfworks | The Big Bad Wolf 9000 (huffs, puffs, scatters the flock, blows fences down) | 20 min |
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

1. **A changing population.** `add(sheep) → id` for strays and lambs; `take(id)` and
   `release(id, x, y)` for a sheep that is carried (the game moves it while carried; the model
   ignores it); stable ids across adds and removals.
2. **A stimulus grid** inside the model (above), invisible to the game.
3. **Tests**: a carried sheep released near the flock rejoins it; a wolf (a threat) can cut a
   straggler out; 200 sheep under 300 threats stays inside the budget; determinism with adds
   and removals.

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
| **S0: Find the fun** | Greybox in the existing engine: the meadow, 8 sheep, Gafoop with the stamp and the stapler, Gloops and saucers, grabbing and rescue, wool as experience, a level-up screen with about eight items, strays, a 10-minute run, lose at zero sheep. Two builds: bucket-to-lead and always-follow | Testers ask for another run; protecting feels like being a sheepdog, not babysitting; every lost sheep was seen being lost; it runs at 50 fps on a phone with 100 sheep and 150 enemies |
| **S1: Stage 1** | The Valley as a full 15-minute stage: timeline and director, six archetypes, 8 armaments, 10 provisions, 3 evolutions, crates, elites, the Repo Mothership, the hearing, grazing (if S0 kept it), contract v2, the run harness | A full run on an iPhone at ≥ 50 fps with 150 sheep and 200 enemies; harness graphs show a level-up every 15–25 s early and every 40–60 s late; median first run ends after minute 8 |
| **S2: Between runs** | Wool banking, the Requisition Catalogue, Forms as unlocks, three breeds, a second character, the Almanac, appeal court and the Tax Inspector | A new player meets a new item or breed in each of their first ten runs |
| **S3: The story** | The revised intro (new lines, the saucer and crate beats), hearing cutscenes per stage, barks for every first meeting, music that layers with the pressure | The intro hands over into the first run with no menu in between |
| **S4: Content** | Stages 2–4 and their bosses, the full catalogue, accessibility (effects opacity, screen shake, colour-blind outlines), balancing | Each stage cleared by a tester within ten attempts |

S0 is the decision point: if protecting a flock is not fun in the greybox, nothing later fixes it.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| **The escort-mission problem**: the flock feels like a liability | It is the experience engine and a weapon platform (§5.4, §8.4); losses are reversible; strays and lambs refill it; S0 tests this before anything else |
| **Death spiral**: fewer sheep, less experience, fewer sheep | Kills always pay; strays keep appearing; maxed level-ups give sheep; the Appeal; the director eases off a shrinking flock |
| **Emergent chaos reads as unfair** | Telegraphs for every loss (§7.4), calm upgrades, the flock retuned a little less flighty for runs |
| **Clutter at 640×360** | Fewer, larger enemies than the genre's hordes; small warm projectiles; an effects-opacity setting; white sheep reserved for sheep |
| **Phone performance** | Measured budgets (§10.2), the stimulus grid, caps by tier, the perf test in every milestone's exit criteria |
| **Grazing is one system too many** | It can be switched off; S0 decides |
| **Losing what made Autosheep distinct** | The flock model is the selling point in both games; the branch takes only what works |
| **Scope** | S1 uses a third of the catalogue; content is data |

---

## 13. Open questions

| Question | Recommendation |
|---|---|
| Does the flock follow Gafoop by default, or only while the bucket is held? | Prototype both in S0; lean towards the bucket |
| Is the flock the only fail state? | Yes, with knockouts for Gafoop (§6) |
| Run length | 15 minutes for stage 1, 20 after; phones may want a 10-minute mode |
| Does building survive (hurdles, pens)? | Not in S0. Later, possibly as deployable gear (a hurdle ring, a woof post) in the way Brotato has structures |
| Grazing pressure | Keep it if S0 shows it adds decisions, not chores |
| Does the automation game stay on main? | Yes; this branch is an experiment until S0 says otherwise |

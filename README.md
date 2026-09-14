# Adventure Land Multi-Character Automation

Modular JavaScript framework for [Adventure Land](https://adventure.land) automation. Built for multiple characters on one account using shared saved CODE files.

**Characters**
- **Dorg** — Warrior, party leader, crab farmer
- **Prorg** — Priest, heals / follows / assists Dorg
- **Dorchant** — Merchant mule (bank home; sell / pots / gear logistics)
- *(planned)* 2 more combat members → 4 party + Dorchant = 5

---

## File layout

```
├── core/
│   ├── CORE_Utils.js
│   ├── CORE_Party.js
│   ├── CORE_Survival.js
│   ├── CORE_Inventory.js
│   ├── CORE_Restock.js
│   ├── CORE_Travel.js
│   ├── CORE_Benchmark.js
│   └── CORE_TownNav.js
├── classes/
│   ├── WAR_Combat.js
│   ├── PRI_Combat.js
│   └── MER_Logistics.js
├── characters/
│   ├── DORG_Config.js
│   ├── DORG_Main.js
│   ├── PRORG_Config.js
│   ├── PRORG_Main.js
│   ├── DORCHANT_Config.js
│   └── DORCHANT_Main.js
└── tools/
    └── UpdateCode.js
```

Runtime model: each character has its own JS context. Saved CODE is account-wide.

```js
globalThis.BOT = { role, config };
// modules attach: BOT.survival, BOT.combat, BOT.benchmark, ...
```

All shared logic reads **`BOT.config`** (never `WAR_CONFIG` / `PRI_CONFIG`).

---

## Main loop priority

1. Party management  
2. Death / survival  
3. Inventory cleanup  
4. Restock  
5. Travel  
6. Combat  
7. Loot  
8. Benchmark update  

Async ticks use a **busy flag** so intervals never overlap.

---

## How to run Dorg

1. Sync CODE slots from GitHub (see below), or paste each file into a CODE slot with the **same name** as the file (e.g. `CORE_Utils`, `DORG_Main`).
2. On **Dorg**, run / load: **`DORG_Main`**
3. Confirm party invites go to Prorg and farming starts on `crab`.

Manual console checks:

```js
BOT.config.farm.monster
BOT.party.partyList()
BOT.benchmark.report()
```

---

## How to run Prorg

1. Ensure the same shared CODE slots are saved (account-wide).
2. On **Prorg**, run / load: **`PRORG_Main`**
3. Prorg accepts Dorg’s invite (and can send a party request as fallback).
4. Heals Dorg below 85% HP, self below 75%, follows, then assists Dorg’s target.

---

## GitHub syncing (`UpdateCode`)

Repo: [DouglasHerron/landmmo](https://github.com/DouglasHerron/landmmo)

1. Push this project to the public GitHub repo.
2. In Adventure Land, create/load a CODE slot named `UpdateCode` (contents of `tools/UpdateCode.js`).
3. Edit `REPO` / `BRANCH` at the top of that file if needed.
4. Run:

```js
await BOT_UPDATE.run()
```

Or sync a subset:

```js
await BOT_UPDATE.run(["DORG_Main", "CORE_Party", "WAR_Combat"])
```

**Security:** never put GitHub PATs, tokens, or passwords in CODE. Public repo + raw URLs only. For a private repo, paste files manually or use a local proxy you control.

After syncing, reload `DORG_Main` / `PRORG_Main` / `DORCHANT_Main` on each character.

---

## Change farm monster

Edit `characters/DORG_Config.js` (or the `DORG_Config` CODE slot):

```js
farm: {
    monster: "crab",          // change to another mtype when ready
    maxChaseDistance: 250
}
```

Notes:
- Current safe farm is normal **`crab`**, not **`crabx`** (Huge Crab).
- Optional exact coordinates (supported by `CORE_Travel`):

```js
farm: {
    monster: "crab",
    x: 0,
    y: 0,
    map: "main"
}
```

Re-sync / reload Config + Main after changes.

---

## Inspect benchmark

On the character running the bot:

```js
BOT.benchmark.report()
BOT.benchmark.reset()
```

Tracks runtime, XP, XP/hr, gold, gold/hr, HP/MP pots used, deaths.  
Auto-reports every `BOT.config.benchmark.reportEveryMinutes` (default 10).

Potion use is incremented from survival events (not inventory delta), so restocking does not inflate counts.

Known crab baseline (Dorg solo era): ~5.34M XP/hr, ~1.23M gold/hr, 0 deaths over multi-hour runs.

---

## Inventory policy (Dorg)

| Item | Action |
|------|--------|
| `ringsj` +0 | Sell (near merchant) |
| `hpbelt` +0 | Sell (near merchant) |
| +1+ / statted / locked | Keep → bank |
| `anniversarygift` | Bank (not carry) |
| Potions / scrolls / boosters | Protected |

Selling only happens after travel to a vendor — never from the farm.

---

## How to run Dorchant

1. Sync CODE (includes `MER_Logistics`, `DORCHANT_Config`, `DORCHANT_Main`).
2. On **Dorchant**, run / load: **`DORCHANT_Main`**
3. Dorchant accepts Dorg’s invite and stays near the **bank** (`config.home`).
4. Can sell whitelist junk / bank loot / restock pots, then return to bank (not the farm).
5. **Gear progression:** scouts the farm, reads party slots, then buys/upgrades/compounds **only gaps** vs `upgrade.targets`. Console: `BOT.logistics.gearReport()`.
6. **Farmer inventory:** visits crabs every ~3 min (or on `need_dump` CM). Farmers `send_item` junk/loot to Dorchant; he sells/banks. Farmers stay on the farm (`autoSell`/`autoBank` off).

Next mule phases (not done yet): deliver finished gear/pots.

---

## Add a new class later

1. Add `classes/MAGE_Combat.js` (etc.) attaching to `BOT.combat` (or `BOT.logistics` for merchant).
2. Add `characters/NAME_Config.js` with `role` + `BOT.config`.
3. Add `characters/NAME_Main.js` that loads CORE modules + the class module and runs the priority loop.
4. Register the new files in `tools/UpdateCode.js` → `FILES`.
5. Add the name to Dorg’s `party.members`, sync, then load that character’s Main.

Keep generic behavior in **CORE_***; only put class-unique logic in **classes/**.

**Dorchant** owns bank cleanup, selling, combining, buying, and gear logistics — combat mains should eventually stop leaving the farm for town.

---

## Party gear targets (Dorchant)

Configured in `DORCHANT_Config` → `upgrade.targets`:

| For | Items | Cap |
|-----|--------|-----|
| Dorg | blade | +6 |
| Dorg | helmet, coat, pants, gloves, shoes | +5 |
| Dorg | strring, strearring (compound) | +3 |
| Prorg | staff | +6 |
| Prorg | helmet, coat, pants, gloves, shoes | +5 |
| Prorg | intring, intearring (compound) | +3 |

Wishlist gear below useful max (party still needs it) is held in inventory. Items the whole party already has at cap are not bought or upgraded further.

Scout visits `scout.meet` (default `crab`) so Dorchant can see slots — bank range cannot.

## Standalone scripts (not in Main loop)

Planned separate CODE tools (not required for the core farm loop):
- Anniversary exchange (`anniversarygift` via **Xyn**, not Mira)

---

## Design rules

- Modular, defensive, whitelist-based selling  
- No overlapping async loops  
- No automatic item destruction  
- No secrets in the repo  

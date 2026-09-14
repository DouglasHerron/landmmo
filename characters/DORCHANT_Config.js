/**
 * DORCHANT_Config.js
 * Merchant / party mule configuration for Dorchant.
 * Safe to load_code before DORCHANT_Main.
 */
(function () {
    "use strict";

    globalThis.BOT = {
        role: "merchant",

        config: {
            name: "Dorchant",

            party: {
                leader: "Dorg",
                members: ["Dorg"],
                // Request if Dorg's invite hasn't arrived (merchant often off-screen)
                requestFallback: true
            },

            // Characters Dorchant services (pots / gear / dumps) — expand as roster grows
            clients: ["Dorg", "Prorg"],

            home: {
                to: "bank"
            },

            mule: {
                dumpDistance: 320,
                deliverPots: true,
                pickupEveryMinutes: 2,
                lingerSeconds: 25
            },

            /**
             * Visit the farm to read party slots (bank can't see them).
             * Cache drives buy / upgrade / compound — skip items already at cap.
             */
            scout: {
                enabled: true,
                everyMinutes: 8,
                meet: "crab"
            },

            /**
             * Gear progression for Dorg / Prorg.
             * Only processes gaps from scout (equipped + visible inventory).
             */
            upgrade: {
                enabled: true,
                buyScrolls: true,
                minimumScrolls: 5,
                desiredScrolls: 20,
                targets: [
                    // Dorg — warrior
                    { for: "Dorg", name: "blade", maxLevel: 6 },
                    { for: "Dorg", name: "helmet", maxLevel: 5 },
                    { for: "Dorg", name: "coat", maxLevel: 5 },
                    { for: "Dorg", name: "pants", maxLevel: 5 },
                    { for: "Dorg", name: "gloves", maxLevel: 5 },
                    { for: "Dorg", name: "shoes", maxLevel: 5 },
                    { for: "Dorg", name: "strring", maxLevel: 3 },
                    { for: "Dorg", name: "strearring", maxLevel: 3 },

                    // Prorg — priest
                    { for: "Prorg", name: "staff", maxLevel: 6 },
                    { for: "Prorg", name: "helmet", maxLevel: 5 },
                    { for: "Prorg", name: "coat", maxLevel: 5 },
                    { for: "Prorg", name: "pants", maxLevel: 5 },
                    { for: "Prorg", name: "gloves", maxLevel: 5 },
                    { for: "Prorg", name: "shoes", maxLevel: 5 },
                    { for: "Prorg", name: "intring", maxLevel: 3 },
                    { for: "Prorg", name: "intearring", maxLevel: 3 }
                ]
            },

            buyGear: {
                enabled: true,
                minGold: 50000
            },

            survival: {
                hpPotionAt: 0.50,
                mpPotionAt: 0.30,
                retreatAt: 0.25,
                autoRespawn: true
            },

            restock: {
                enabled: true,
                hpPotion: "hpot1",
                mpPotion: "mpot1",
                minimumHpPotions: 50,
                minimumMpPotions: 50,
                desiredHpPotions: 200,
                desiredMpPotions: 200
            },

            inventory: {
                minimumFreeSlots: 8,
                autoSell: true,
                autoBank: true,

                sellItems: [
                    "ringsj",
                    "hpbelt"
                ],

                protectedItems: [
                    "hpot0",
                    "hpot1",
                    "mpot0",
                    "mpot1",
                    "scroll0",
                    "scroll1",
                    "scroll2",
                    "cscroll0",
                    "cscroll1",
                    "cscroll2",
                    "strscroll",
                    "dexscroll",
                    "intscroll",
                    "vitscroll",
                    "xpbooster",
                    "goldbooster",
                    "luckbooster"
                ]
            },

            benchmark: {
                enabled: true,
                reportEveryMinutes: 10
            }
        }
    };

    if (typeof game_log === "function") game_log("DORCHANT_Config loaded", "#A0FFA0");
})();

/**
 * DORG_Config.js
 * Warrior / party leader configuration for Dorg.
 * Safe to load_code before DORG_Main.
 */
(function () {
    "use strict";

    globalThis.BOT = {
        role: "warrior",

        config: {
            name: "Dorg",

            party: {
                leader: "Dorg",
                members: ["Prorg", "Dorchant"]
            },

            farm: {
                monster: "crab",
                maxChaseDistance: 250
                // Optional later:
                // x: 0, y: 0, map: "main"
            },

            survival: {
                hpPotionAt: 0.80,
                mpPotionAt: 0.50,
                retreatAt: 0.45,
                autoRespawn: true
            },

            combat: {
                enabled: true,
                useCharge: true,
                useCleave: false,
                cleaveMinimumTargets: 2,
                cleaveRadius: 80
            },

            restock: {
                enabled: true,
                hpPotion: "hpot1",
                mpPotion: "mpot1",
                minimumHpPotions: 100,
                minimumMpPotions: 100,
                desiredHpPotions: 500,
                desiredMpPotions: 500
            },

            // Dorchant handles sell/bank — farmers dump when he's nearby
            mule: {
                name: "Dorchant",
                dumpDistance: 320
            },

            inventory: {
                minimumFreeSlots: 8,
                autoSell: false,
                autoBank: false,

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

    if (typeof game_log === "function") game_log("DORG_Config loaded", "#A0FFA0");
})();

/**
 * PRORG_Config.js
 * Priest / party follower configuration for Prorg.
 * Safe to load_code before PRORG_Main.
 */
(function () {
    "use strict";

    globalThis.BOT = {
        role: "priest",

        config: {
            name: "Prorg",

            party: {
                leader: "Dorg",
                members: ["Dorg"],
                // Dorg invites — do not spam send_party_request
                requestFallback: false
            },

            survival: {
                hpPotionAt: 0.70,
                mpPotionAt: 0.40,
                retreatAt: 0.30,
                autoRespawn: true
            },

            healing: {
                healLeaderBelow: 0.85,
                healSelfBelow: 0.75
            },

            combat: {
                enabled: true,
                assistLeader: true
            },

            movement: {
                followDistance: 70,
                maxDistance: 250
            },

            restock: {
                enabled: true,
                hpPotion: "hpot1",
                mpPotion: "mpot1",
                minimumHpPotions: 100,
                minimumMpPotions: 150,
                desiredHpPotions: 300,
                desiredMpPotions: 700
            },

            mule: {
                name: "Dorchant",
                dumpDistance: 320,
                sendGold: true,
                keepGold: 200000
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

    if (typeof game_log === "function") game_log("PRORG_Config loaded", "#A0FFA0");
})();

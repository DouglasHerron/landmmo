/**
 * CORE_Party.js
 * Conservative party management — never spam invites/requests when already grouped.
 *
 * Adventure Land:
 *   character.party  → leader's name when in a party, falsy when solo
 *   parent.party     → map of members (keys may be names or ids)
 *   get_player(name).party → that player's leader name
 */
(function () {
    "use strict";

    globalThis.BOT = globalThis.BOT || {};

    const INVITE_COOLDOWN_MS = 30000;
    const REQUEST_COOLDOWN_MS = 30000;

    let lastInviteAt = 0;
    let lastRequestAt = 0;
    let lastLogAt = 0;

    function utils() {
        return BOT.utils || {};
    }

    function partyCfg() {
        return (BOT.config && BOT.config.party) || {};
    }

    function leaderName() {
        return partyCfg().leader || "";
    }

    function memberNames() {
        return partyCfg().members || [];
    }

    function uniquePush(arr, name) {
        if (!name) return;
        if (arr.indexOf(name) === -1) arr.push(name);
    }

    function partyList() {
        const names = [];

        try {
            if (parent && parent.party && typeof parent.party === "object") {
                for (const key in parent.party) {
                    if (!Object.prototype.hasOwnProperty.call(parent.party, key)) continue;
                    const entry = parent.party[key];
                    if (entry && typeof entry === "object" && entry.name) uniquePush(names, entry.name);
                    else uniquePush(names, key);
                }
            }
        } catch (e) { /* ignore */ }

        try {
            if (typeof get_party === "function") {
                const p = get_party();
                if (Array.isArray(p)) {
                    for (let i = 0; i < p.length; i++) uniquePush(names, typeof p[i] === "string" ? p[i] : (p[i] && p[i].name));
                } else if (p && typeof p === "object") {
                    for (const key in p) {
                        const entry = p[key];
                        if (entry && entry.name) uniquePush(names, entry.name);
                        else uniquePush(names, key);
                    }
                }
            }
        } catch (e) { /* ignore */ }

        try {
            if (parent && parent.party_list) {
                if (Array.isArray(parent.party_list)) {
                    for (let i = 0; i < parent.party_list.length; i++) uniquePush(names, parent.party_list[i]);
                } else if (typeof parent.party_list === "object") {
                    for (const key in parent.party_list) uniquePush(names, key);
                }
            }
        } catch (e) { /* ignore */ }

        try {
            if (character && character.name) uniquePush(names, character.name);
        } catch (e) { /* ignore */ }

        return names;
    }

    function playerInOurParty(name) {
        if (!name) return false;

        const list = partyList();
        if (list.indexOf(name) !== -1) return true;

        try {
            if (typeof get_player === "function") {
                const p = get_player(name);
                if (p && p.party) {
                    // Same party leader as us
                    if (character.party && p.party === character.party) return true;
                    if (p.party === character.name) return true;
                }
            }
        } catch (e) { /* ignore */ }

        return false;
    }

    function isLeader() {
        const leader = leaderName();
        return !!(leader && character && character.name === leader);
    }

    /**
     * Already in the correct party? Be liberal — stopping spam matters most.
     */
    function isGrouped() {
        if (!character) return false;

        // Solo
        if (!character.party) return false;

        const leader = leaderName();

        if (!isLeader()) {
            // Follower: in the right leader's party
            return !leader || character.party === leader;
        }

        // Leader: we're in a party we lead (or any party with our name as party id)
        if (character.party !== character.name && character.party !== leader) {
            return false;
        }

        const members = memberNames();
        if (!members.length) return true;

        // If every configured member appears to be with us, grouped.
        // If a member is offline (can't see them), still treat as grouped to avoid spam.
        for (let i = 0; i < members.length; i++) {
            const name = members[i];
            if (playerInOurParty(name)) continue;

            let visible = null;
            try {
                if (typeof get_player === "function") visible = get_player(name);
            } catch (e) { /* ignore */ }

            if (!visible) continue; // offline / other map — do not spam invites
            return false; // online and not in our party
        }
        return true;
    }

    function sendInvite(name) {
        try {
            if (typeof send_party_invite === "function") send_party_invite(name);
            else if (typeof party_invite === "function") party_invite(name);
        } catch (e) {
            if (utils().error) utils().error("invite: " + (utils().safeError ? utils().safeError(e) : e));
        }
    }

    function logStatus(force) {
        const now = Date.now();
        if (!force && now - lastLogAt < 15000) return;
        lastLogAt = now;
        if (!utils().log) return;
        utils().log(
            "Party status | me=" + character.name +
            " character.party=" + (character.party || "none") +
            " grouped=" + isGrouped() +
            " list=" + JSON.stringify(partyList())
        );
    }

    function handle() {
        if (!character) return false;

        try {
            logStatus(false);

            // -------------------------------------------------------
            // HARD STOP: already in a party → never request, rarely invite
            // -------------------------------------------------------
            if (character.party) {
                if (!isLeader()) {
                    // Follower already grouped — do nothing forever
                    return false;
                }

                // Leader already in a party — only invite if a member is
                // visible nearby AND clearly not in our party.
                if (isGrouped()) return false;

                const now = Date.now();
                if (now - lastInviteAt < INVITE_COOLDOWN_MS) return false;

                const members = memberNames();
                let invited = false;
                for (let i = 0; i < members.length; i++) {
                    const name = members[i];
                    if (!name || name === character.name) continue;
                    if (playerInOurParty(name)) continue;

                    let visible = null;
                    try {
                        if (typeof get_player === "function") visible = get_player(name);
                    } catch (e) { /* ignore */ }

                    if (!visible) continue; // don't invite ghosts

                    sendInvite(name);
                    invited = true;
                    if (utils().log) utils().log("Party invite (member online, not grouped) -> " + name);
                }
                if (invited) lastInviteAt = now;
                return false;
            }

            // -------------------------------------------------------
            // Not in a party — form one
            // -------------------------------------------------------
            if (isLeader()) {
                const now = Date.now();
                if (now - lastInviteAt < INVITE_COOLDOWN_MS) return false;
                lastInviteAt = now;

                const members = memberNames();
                for (let i = 0; i < members.length; i++) {
                    const name = members[i];
                    if (!name || name === character.name) continue;
                    sendInvite(name);
                    if (utils().log) utils().log("Party invite (solo) -> " + name);
                }
            } else {
                const leader = leaderName();
                if (!leader) return false;

                // Prefer accepting an invite; only request on a long cooldown
                try {
                    if (typeof accept_party_invite === "function") accept_party_invite(leader);
                } catch (e) { /* ignore */ }

                const now = Date.now();
                if (now - lastRequestAt < REQUEST_COOLDOWN_MS) return false;
                lastRequestAt = now;

                try {
                    if (typeof send_party_request === "function") {
                        send_party_request(leader);
                        if (utils().log) utils().log("Party request (solo) -> " + leader);
                    }
                } catch (e) { /* ignore */ }
            }
        } catch (e) {
            if (utils().error) utils().error("CORE_Party: " + (utils().safeError ? utils().safeError(e) : e));
        }

        return false;
    }

    globalThis.on_party_invite = function (name) {
        try {
            if (!name || isLeader()) return;
            if (leaderName() && name !== leaderName()) return;
            if (character.party) return;
            if (typeof accept_party_invite === "function") accept_party_invite(name);
            if (utils().log) utils().log("Accepted invite from " + name);
        } catch (e) { /* ignore */ }
    };

    globalThis.on_party_request = function (name) {
        try {
            if (!name || !isLeader()) return;
            if (memberNames().indexOf(name) === -1) return;
            if (typeof accept_party_request === "function") accept_party_request(name);
            if (utils().log) utils().log("Accepted request from " + name);
        } catch (e) { /* ignore */ }
    };

    BOT.party = {
        handle: handle,
        isLeader: isLeader,
        isGrouped: isGrouped,
        partyList: partyList,
        inPartyWith: playerInOurParty,
        logStatus: function () { logStatus(true); }
    };

    if (utils().log) utils().log("CORE_Party loaded (conservative)");
})();

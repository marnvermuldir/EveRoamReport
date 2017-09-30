// TODO:
//  - Input validation.
//  - Abuse prevention and rate limiting (may require backend/caching).
//  - Custom output formatting:
//      - Different forum post templates.
//      - Custom number formatting for isk values.
//      - Allow killfeed.eveuni (not sure if worth, kill ids don't match between zkill and killfeed)
//  - Discuss with Zarquu: Integration with the new SRP system.
//  - Other roam metrics>
//      - Damage?
//      - Member participation on kills?
//      - Time?
//      - Corps/Alliances involved?
//      - Losses/Corp?
//      - Ship kill/loss count?
//      - Uni members involved?
//  - Manually add kills?
//  - Other forms of editing?
//  - Ship icons?
//  - Detect missing fleet members?
//  - Permalinks to roam reports?
//  - Additional visualisations?
//      - visual timeline?
//      - parallel tracks for different systems?
//  - Detect if browser is supported (obviously, Fetch API is not supported in IE).

window.knownTypes = {};
window.unknownTypes = [];
window.characters = {}; // This value does not need to be reset.
window.missingCharacters = []

function numeric_sort(a, b) { return a-b; }

function kill_sort(a, b)
{
    if (a.date > b.date) return 1;
    if (a.date == b.date) return 0;
    return -1;
}

function get_kill_by_id(id, killList)
{
    for (var i = 0; i < killList.length; ++i) {
        if (killList[i].killmail_id == id) return killList[i];
    }
    return undefined;
}

function enter_names()
{
    var loader = document.getElementsByClassName("loader")[0];
    loader.style.display = "inherit";

    var elem = document.getElementsByName("names")[0];
    var nameList = elem.value.split("\n");
    window.finalNames = [];
    window.killIDs = [];
    window.unsortedKills = [];
    window.friendlies = [];
    var charNameRegex1 = /\[ ([\d\. :]+) \] ([ a-zA-Z0-9-']{3,37}) > /;
    var charNameRegex2 = /^\s*([ a-zA-Z0-9-']{3,37})\s*$/

    window.starttime = undefined;
    window.endtime = undefined;

    for(var i = 0; i < nameList.length; ++i) {
        var line = nameList[i].trim();
        var name = undefined;
        var match = undefined;
        if ((match = charNameRegex1.exec(line)) !== null) {
            name = match[2].trim();
            var date = new Date(match[1] + " GMT");
            if (window.starttime === undefined) {
                window.starttime = match[1].replace(/[\. ]/g, "").slice(0, 10);
            }
            date.setHours(date.getHours() + 1);
            window.endtime = date.toISOString().replace(/[-T]/g, "").slice(0,10);
        } else if ((match = charNameRegex2.exec(line)) !== null) {
            name = match[1].trim();
        }

        // If the player named "EVE System" ever becomes active, this script will no longer be accurate.
        if (name && name != "EVE System" && window.finalNames.indexOf(name) == -1) {
            window.finalNames.push(name);
        }
    }

    console.log("Players involved:" + window.finalNames);

    var nameQuery = "https://api.eveonline.com/eve/CharacterID.xml.aspx?names=" + window.finalNames.map(x => escape(x)).join();
    fetch(new Request(nameQuery, {method: 'GET'}))
    .then(response => {
        if (response.status != 200) throw new Error("API request failed to get list of character IDs");
        return response.text();
    })
    .then(xmltext => {
        // There really is no need to do xml processing...
        var charIdRegex = /name="([^"]+)"\s+characterID="(\d+)"/gi;
        var match;
        while ((match = charIdRegex.exec(xmltext)) !== null) {
            var name = match[1];
            var id = parseInt(match[2]);
            if (id != 0) window.friendlies.push(id);
            window.characters[id] = name;
        }
        window.friendlies = window.friendlies.sort(numeric_sort);
        console.log("Got character IDs");
        request_kill_batch(window.friendlies, 0);
    })
    .catch(function(error) {
        console.error(error);
        var loader = document.getElementsByClassName("loader")[0];
        loader.style.display = "none";
    });
}

function request_kill_batch(characterIDs, start)
{
    console.log("Requesting kills for chars: " + start);

    var group = characterIDs.slice(start, start+10);
    var killQuery = "https://zkillboard.com/api/characterID/" + group.join() + "/startTime/"+window.starttime+"00/endTime/"+window.endtime+"00/no-items/";
    fetch(new Request(killQuery, {method: 'GET', mode: 'cors'}))
    .then(response => {
        if (response.status != 200) throw new Error("API request failed to get list of character IDs");
        return response.json();
    })
    .then(kills => {
        var killAddCount = 0;
        for (var i = 0; i < kills.length; ++i) {
            var kill = kills[i];
            if (window.killIDs.indexOf(kill.killmail_id) >= 0) continue;
            kill.date = new Date(kill.killmail_time);
            window.killIDs.push(kill.killmail_id);
            window.unsortedKills.push(kill);
            if (window.unknownTypes.indexOf(kill.victim.ship_type_id) == -1 && !window.knownTypes[kill.victim.ship_type_id]) {
                window.unknownTypes.push(kill.victim.ship_type_id);
            }
            killAddCount += 1;
        }
        console.log("Added " + killAddCount + " kills");
        if (start+10 < characterIDs.length) {
            request_kill_batch(characterIDs, start+10);
        } else {
            update_eve_types();
        }
    })
    .catch(function(error) {
        console.error(error);
        var loader = document.getElementsByClassName("loader")[0];
        loader.style.display = "none";
    });
}

function update_eve_types()
{
    var types = window.unknownTypes.slice(0,250).join();
    window.unknownTypes = window.unknownTypes.slice(250);
    var typesQuery = "https://api.eveonline.com/eve/TypeName.xml.aspx?ids=" + types;

    function next_request() {
        if (window.unknownTypes.length > 0) {
            update_eve_types();
        } else {
            process_kills();
        }
    }

    fetch(new Request(typesQuery, {method: 'GET'}))
    .then(response => {
        if (response.status != 200) {
            next_request();
            throw new Error("API request failed to get list of character IDs");
        }
        return response.text();
    })
    .then(xmltext => {
        // There really is no need to do xml processing...
        var typeRegex = /typeID="(\d+)"\s*typeName="([^"]+)"/gi;
        var match;
        while ((match = typeRegex.exec(xmltext)) !== null) {
            window.knownTypes[match[1]] = match[2];
        }
        next_request();
    })
    .catch(function(error) {
        console.error(error);
        var loader = document.getElementsByClassName("loader")[0];
        loader.style.display = "none";
    });

}

function process_kills()
{
    console.log("Processing kills...");

    window.workingKillSet = window.unsortedKills.sort(kill_sort);
    var table = document.getElementsByName("killdisplay")[0];
    table.innerHTML = '<div class="krh"><div class="kh">New fight?</div><div class="kh">Time</div><div class="kh">Kill/Loss</div><div class="kh">Ship</div><div class="kh">Victim</div><div class="kh">Final Blow</div><div class="kh">Location</div><div class="kh">ISK</div></div>';

    for (var i = 0; i < window.workingKillSet.length; ++i) {
        var kill = window.workingKillSet[i];
        var is_friendly = window.friendlies.indexOf(kill.victim.character_id) > -1;
        var row = document.createElement("div"); row.className = "kr-on"; table.appendChild(row);
        row.name = kill.killmail_id;

        kill.display_row = row;
        kill.is_friendly = is_friendly;
        kill.is_included = true;
        kill.is_fight_start = (i == 0 || (kill.date - window.workingKillSet[i-1].date) > 5 * 60 * 1000);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        cell.innerHTML = '<input type="checkbox" checked id="'+kill.killmail_id+'">';
        kill.is_fight_start_check_box = cell.children[0];
        kill.is_fight_start_check_box.checked = kill.is_fight_start;
        kill.is_fight_start_check_box.addEventListener('change', function (event) {
            var kill = get_kill_by_id(parseInt(event.target.id), window.workingKillSet);
            kill.is_fight_start = event.target.checked;
            update_kill_display(kill);
        });

        kill.is_fight_start_check_box.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        kill.is_fight_start_check_box.addEventListener('touchdown', function (event) { event.stopPropagation(); });

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        cell.innerHTML = "<a href=https://zkillboard.com/kill/"+kill.killmail_id+"/ target=\"_blank\">"+kill.killmail_time+"</a>";
        kill.zkill_href = cell.children[0];

        kill.zkill_href.addEventListener('mousedown', function (event) { event.stopPropagation(); });
        kill.zkill_href.addEventListener('touchdown', function (event) { event.stopPropagation(); });

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        t = document.createTextNode(is_friendly ? "Loss" : "Kill");
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        var shipName = window.knownTypes[kill.victim.ship_type_id];
        if (shipName === undefined) shipName = "Unknown Type";
        t = document.createTextNode(shipName);
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        t = document.createTextNode(window.characters[kill.victim.character_id]);
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        t = document.createTextNode(window.characters[kill.attackers.filter(x => x.final_blow == 1)[0].character_id]);
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        var systemName = window.solarSystems[kill.solar_system_id];
        if (systemName === undefined) systemName = "sysId_"+kill.solar_system_id;
        t = document.createTextNode(systemName);
        cell.appendChild(t);

        var cell = document.createElement("div"); cell.className = "kd"; row.appendChild(cell);
        t = document.createTextNode((Math.round(kill.zkb.totalValue/10000)/100) + "m");
        cell.appendChild(t);

        update_kill_display(kill);
    }

    var loader = document.getElementsByClassName("loader")[0];
    loader.style.display = "none";
    var stepTwo = document.getElementsByClassName("step-two")[0];
    stepTwo.style.display = "inherit";
}

function update_kill_display(kill)
{
    kill.is_fight_start_check_box.checked = kill.is_fight_start;
    if (kill.is_fight_start) {
        kill.display_row.style.borderTop = "solid 2px #ccc";
    } else {
        kill.display_row.style.borderTop = "0px";
    }


    if (kill.is_included) {
        kill.display_row.className = "kr-on";
        kill.display_row.style.color = kill.is_friendly ? "red" : "green";
    } else {
        kill.display_row.className = "kr-off";
        kill.display_row.style.color = "#aaa";
    }
}

function get_forum_post()
{
    var lines = []
    lines.push("    Roam members (" + window.finalNames.length + ") - NOTE: This section is NOT usually included in AARs.");
    window.finalNames = window.finalNames.sort();
    for (var i = 0; i < window.finalNames.length; ++i) {
        lines.push(window.finalNames[i]);
    }
    lines.push("\n    Kills and Losses");

    var iskGain = 0;
    var iskLoss = 0;
    var firstKill = true;
    var addSeparator = true;
    for (var i = 0; i < window.workingKillSet.length; ++i) {
        var kill = window.workingKillSet[i];
        if (kill.is_fight_start) addSeparator = true;
        if (!kill.is_included) continue;

        var friendlyLine = kill.is_friendly ? "FF0000]-" : "00FF00]+";
        var shipName = window.knownTypes[kill.victim.ship_type_id];
        if (shipName === undefined) shipName = "Unknown Type";

        if (addSeparator) {
            var regions = [kill.solar_system_id];
            for (var j = i+1; j < window.workingKillSet.length; ++j) {
                var kk = window.workingKillSet[j];
                if (kk.is_fight_start) break;
                if (kk.is_included && regions.indexOf(kk.solar_system_id) == -1) {
                    regions.push(kk.solar_system_id);
                }
            }
            var regions = regions.map(x => {
                var systemName = window.solarSystems[x];
                if (systemName === undefined) return "sysId_"+x;
                return systemName;
            })

            lines.push((firstKill ? "(" : "\n(") + kill.killmail_time.slice(11) + ") " + regions.join(", "));
            addSeparator = false;
            firstKill = false;
        }
        lines.push("[url=https://zkillboard.com/kill/"+kill.killmail_id+"/]"+shipName+"[/url] [color=#" + friendlyLine + (Math.round(kill.zkb.totalValue/10000)/100)+ "m[/color]");

        if (!kill.is_friendly) {
            iskGain += kill.zkb.totalValue;
        } else {
            iskLoss += kill.zkb.totalValue;
        }
    }

    lines.push("\n");
    var deltaColor = iskLoss < iskGain ? "[color=#00FF00]" : "[color=#FF0000]";

    lines.push("    Stats");
    lines.push("ISK Destroyed: [color=#00FF00]" + iskGain.toLocaleString('en-US') +"[/color]");
    lines.push("ISK Lost: [color=#FF0000]" + iskLoss.toLocaleString('en-US') +"[/color]");
    lines.push("ISK Delta: " + deltaColor + (iskGain - iskLoss).toLocaleString('en-US') +"[/color]");
    lines.push("Efficiency: " + deltaColor + ((iskGain*100) / (iskGain + iskLoss)).toLocaleString('en-US') +"%[/color]");

    var elem = document.getElementsByName("output")[0];
    elem.value = lines.join("\n");
}


var mouseDown = false;
var previousRow = undefined;
var enablingRows = false;
// function kills_mouse_down('mousedown touchstart',
function kills_mouse_down(event) {
    event.preventDefault();
    var row = event.target;
    if (row.tagName == "a" || row.tagName == "input") return;

    while(row && row.className != "kr-on" && row.className != "kr-off") row = row.parentElement;
    if (row) {
        kill = get_kill_by_id(parseInt(row.name), window.workingKillSet);
        enablingRows = !kill.is_included;
        mouseDown = true;
        previousRow = undefined;

        kills_update_include_state(event);
    }
}

function kills_update_include_state(event) {
    // event.preventDefault();
    if(mouseDown) {
        var row = event.target;
        while(row && row.className != "kr-on" && row.className != "kr-off") row = row.parentElement;
        if (row && row != previousRow) {
            kill = get_kill_by_id(parseInt(row.name), window.workingKillSet);
            kill.is_included = enablingRows;
            update_kill_display(kill);
        }
    }
}

function window_mouse_up(event) {
    mouseDown = false;
};

window.onload = function()
{
    var table = document.getElementsByName("killdisplay")[0];
    console.log("loaded " + table);
    table.addEventListener('mousedown', kills_mouse_down);
    table.addEventListener('touchdown', kills_mouse_down);
    table.addEventListener('mousemove', kills_update_include_state);
    table.addEventListener('touchmove', kills_update_include_state);
    document.addEventListener('mouseup', window_mouse_up);
    document.addEventListener('touchend', window_mouse_up);
}

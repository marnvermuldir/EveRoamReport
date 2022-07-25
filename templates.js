let simple = {
  header: () => "",
  membersHeader: (count) => `    Roam members (${count})\n[spoiler]`,
  member: (name, ships) =>
    name + (ships && ships.length > 0 ? " - " + ships.join(", ") : ""),
  membersFooter: () => "[/spoiler]",
  killsHeader: () => "\n    Kills and Losses",
  kill: (zkillLink, shipName, iskMills) =>
    `[url=${zkillLink}]${shipName}[/url] [color=#00FF00]+${iskMills}m[/color]`,
  loss: (zkillLink, shipName, iskMills) =>
    `[url=${zkillLink}]${shipName}[/url] [color=#FF0000]-${iskMills}m[/color]`,
  killListSeparator: (time, regions) =>
    `
(${time}) ` + regions.join(", "),
  killsFooter: () => "",
  statsHeader: () => "    Stats",
  stats: (iskGain, iskLoss) => {
    deltaColor = iskLoss < iskGain ? "[color=#00FF00]" : "[color=#FF0000]";
    return `ISK Destroyed: [color=#00FF00]${iskGain.toLocaleString(
      "en-US"
    )}[/color]
ISK Lost: [color=#FF0000]${iskLoss.toLocaleString("en-US")}[/color]
ISK Delta: ${deltaColor}${(iskGain - iskLoss).toLocaleString("en-US")}[/color]
Efficiency: ${deltaColor}${(
      (iskGain * 100) /
      (iskGain + iskLoss)
    ).toLocaleString("en-US")}%[/color]`;
  },
  statsFooter: () => "",
  footer: () => "",
};

let eUni = {
  header: () => "",
  membersHeader: (count) =>
    `[b][size=150][color=#0080FF]Roam members (${count})[/color][/size][/b]\n[spoiler]`,
  member: (name, ships) =>
    `[b]${name}[/b]` +
    (ships && ships.length > 0 ? " - " + ships.join(", ") : ""),
  membersFooter: () => "[/spoiler]",
  killsHeader: () =>
    "\n[b][size=150][color=#0080FF]Kills and Losses[/color][/size][/b]",
  kill: simple.kill,
  loss: simple.loss,
  killListSeparator: simple.killListSeparator,
  killsFooter: simple.killsFooter,
  statsHeader: () => "[b][size=150][color=#0080FF]Stats[/color][/size][/b]",
  stats: simple.stats,
  statsFooter: () => "",
  footer:
    () => `[b][size=150][color=#0080FF]Overall evaluation[/color][/size][/b]
[list]
[color=#00FF00]\u2714[/color] (Positive stuff)
[color=#FF4000]\u2718[/color] (Negative stuff)
[/list]`,
};

window.templates = {
  simple: simple,
  eUni: eUni,
};

// ✔✘

// [color=#FFFF00]

import { colors, contrastRatio, type ColorToken } from "../src/tokens";

const names = Object.keys(colors) as ColorToken[];
console.log("fg \\ bg".padEnd(11) + names.map((n) => n.padEnd(10)).join(""));
for (const fg of names) {
  console.log(fg.padEnd(11) + names.map((bg) => contrastRatio(colors[fg], colors[bg]).toFixed(2).padEnd(10)).join(""));
}

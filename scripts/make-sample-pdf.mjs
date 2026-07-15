// @ts-nocheck
// Generates a valid, text-extractable sample Biology PDF (no dependencies).
// Run: node scripts/make-sample-pdf.mjs  ->  writes sample-biology.pdf at repo root.
import { writeFileSync } from "node:fs";

const lines = [
	"Introduction to Cell Biology",
	"",
	"The Cell",
	"The cell is the basic structural and functional unit of all living organisms.",
	"Cells are broadly classified into two types: prokaryotic and eukaryotic.",
	"Prokaryotic cells, such as bacteria, lack a membrane-bound nucleus.",
	"Eukaryotic cells, found in plants and animals, contain a true nucleus and",
	"membrane-bound organelles such as mitochondria and the endoplasmic reticulum.",
	"",
	"The Cell Membrane",
	"The cell membrane is a phospholipid bilayer that surrounds the cell.",
	"It is selectively permeable, controlling the movement of substances in and out.",
	"Transport across the membrane occurs by diffusion, osmosis, and active transport.",
	"",
	"Photosynthesis",
	"Photosynthesis is the process by which green plants convert light energy into",
	"chemical energy stored in glucose. It occurs in the chloroplasts.",
	"The overall equation is: 6CO2 + 6H2O + light energy -> C6H12O6 + 6O2.",
	"Photosynthesis has two stages: the light-dependent reactions and the Calvin cycle.",
	"The light reactions occur in the thylakoid membranes and produce ATP and NADPH.",
	"The Calvin cycle occurs in the stroma and fixes carbon dioxide into sugar.",
	"",
	"Cellular Respiration",
	"Cellular respiration releases energy from glucose to produce ATP.",
	"It consists of glycolysis, the Krebs cycle, and the electron transport chain.",
	"Aerobic respiration requires oxygen and yields about 36 ATP per glucose molecule.",
	"",
	"DNA and Genetics",
	"DNA (deoxyribonucleic acid) carries the genetic instructions for life.",
	"It is composed of nucleotides containing adenine, thymine, guanine, and cytosine.",
	"Adenine pairs with thymine, and guanine pairs with cytosine.",
	"Genes are segments of DNA that code for specific proteins.",
	"During cell division, DNA is replicated so each daughter cell receives a copy.",
	"Mitosis produces two identical diploid cells, while meiosis produces four",
	"genetically distinct haploid gametes used in sexual reproduction.",
];

const escapePdfText = (s) =>
	s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

let content = "BT\n/F1 11 Tf\n16 TL\n72 760 Td\n";
for (const line of lines) {
	content += `(${escapePdfText(line)}) Tj\nT*\n`;
}
content += "ET";

const objects = [
	"<< /Type /Catalog /Pages 2 0 R >>",
	"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
	"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
	"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	`<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
];

let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((body, i) => {
	offsets.push(pdf.length);
	pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefStart = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (const off of offsets) {
	pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

writeFileSync("sample-biology.pdf", pdf, "latin1");
console.log(
	`Wrote sample-biology.pdf (${pdf.length} bytes, ${lines.length} lines).`,
);

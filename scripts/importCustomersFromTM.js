const { execFileSync } = require("child_process");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Customer = require("../Models/Customer");

dotenv.config();

const DB_URL = process.env.DATABASE_URL;
const FILE_PATH = path.resolve(process.cwd(), "TM.xlsx");
const DEFAULT_ADDRESS =
  process.env.IMPORT_DEFAULT_ADDRESS || "Address not provided";
const DRY_RUN = process.argv.includes("--dry-run");

function decodeXmlEntities(value) {
  if (!value) return "";
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r");
}

function readZipEntry(zipPath, entryPath) {
  return execFileSync("unzip", ["-p", zipPath, entryPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 100 * 1024 * 1024,
  });
}

function parseSharedStrings(sharedXml) {
  const items = [];
  const siMatches = sharedXml.match(/<si\b[\s\S]*?<\/si>/g) || [];

  for (const si of siMatches) {
    const textParts = [];
    const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let tMatch;

    while ((tMatch = tRegex.exec(si)) !== null) {
      textParts.push(decodeXmlEntities(tMatch[1]));
    }

    items.push(textParts.join(""));
  }

  return items;
}

function parseCell(cellXml, sharedStrings) {
  const attrsMatch = cellXml.match(/^<c\b([^>]*)>/);
  const attrs = attrsMatch ? attrsMatch[1] : "";
  const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
  const typeMatch = attrs.match(/\bt="([^"]+)"/);

  if (!refMatch) return null;

  const col = refMatch[1];
  const type = typeMatch ? typeMatch[1] : "";

  let value = "";
  const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
  const inlineMatch = cellXml.match(/<is>[\s\S]*?<t(?:\s[^>]*)?>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);

  if (type === "s" && vMatch) {
    const index = Number(vMatch[1]);
    value = Number.isNaN(index) ? "" : sharedStrings[index] || "";
  } else if (inlineMatch) {
    value = decodeXmlEntities(inlineMatch[1]);
  } else if (vMatch) {
    value = decodeXmlEntities(vMatch[1]);
  }

  return { col, value: String(value).trim() };
}

function parseWorksheetRows(sheetXml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowAttrs = rowMatch[1];
    const rowBody = rowMatch[2];
    const rowNumMatch = rowAttrs.match(/\br="(\d+)"/);
    const rowNum = rowNumMatch ? Number(rowNumMatch[1]) : null;
    const row = {};

    const cellRegex = /<c\b[\s\S]*?<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const parsedCell = parseCell(cellMatch[0], sharedStrings);
      if (parsedCell) row[parsedCell.col] = parsedCell.value;
    }

    rows.push({ rowNum, row });
  }

  return rows;
}

function buildOps(rows) {
  const ops = [];
  let skipped = 0;
  let withPhone2 = 0;

  for (const entry of rows) {
    const rowNumber = entry.rowNum || 0;
    if (rowNumber === 1) continue;

    const name = (entry.row.B || "").trim();
    const phone1 = (entry.row.C || "").trim();
    const phone2 = (entry.row.D || "").trim();

    if (!name || !phone1) {
      skipped += 1;
      continue;
    }

    if (phone2) withPhone2 += 1;

    ops.push({
      updateOne: {
        filter: { name, phone: phone1 },
        update: {
          $setOnInsert: {
            name,
            phone: phone1,
            address: DEFAULT_ADDRESS,
          },
        },
        upsert: true,
      },
    });
  }

  return { ops, skipped, withPhone2 };
}

async function run() {
  if (!DB_URL) {
    throw new Error(
      "DATABASE_URL is missing in .env. Add it before running this import."
    );
  }

  const sharedXml = readZipEntry(FILE_PATH, "xl/sharedStrings.xml");
  const sheetXml = readZipEntry(FILE_PATH, "xl/worksheets/sheet1.xml");
  const sharedStrings = parseSharedStrings(sharedXml);
  const rows = parseWorksheetRows(sheetXml, sharedStrings);
  const { ops, skipped, withPhone2 } = buildOps(rows);

  console.log(`Parsed rows: ${rows.length}`);
  console.log(`Prepared upserts: ${ops.length}`);
  console.log(`Skipped rows (missing name/phone): ${skipped}`);
  console.log(`Rows with phone #2 (not stored in schema): ${withPhone2}`);

  if (DRY_RUN) {
    console.log("Dry run complete. No database writes performed.");
    return;
  }

  await mongoose.connect(DB_URL);

  const chunkSize = 500;
  let inserted = 0;
  let matched = 0;

  for (let i = 0; i < ops.length; i += chunkSize) {
    const chunk = ops.slice(i, i + chunkSize);
    const result = await Customer.bulkWrite(chunk, { ordered: false });
    inserted += result.upsertedCount || 0;
    matched += result.matchedCount || 0;
  }

  console.log(`Inserted new customers: ${inserted}`);
  console.log(`Already existing matches: ${matched}`);
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Import failed:", error.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });

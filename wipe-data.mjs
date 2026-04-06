import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function wipeMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI in env");

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const dbName = mongoose.connection.db.databaseName;
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log(`[MongoDB] connected db=${dbName}, collections=${collections.length}`);

  await mongoose.connection.db.dropDatabase();
  console.log("[MongoDB] dropDatabase OK");
  await mongoose.disconnect();
}

async function wipeQdrant() {
  const url = (process.env.QDRANT_URL || "").trim();
  const host = (process.env.QDRANT_HOST || "").trim();
  const port = (process.env.QDRANT_PORT || "6333").trim();

  // Memory config uses QDRANT_URL if set; otherwise host/port.
  const baseUrl = url
    ? url.replace(/\/$/, "")
    : host
      ? `http://${host}:${port}`
      : "";

  if (!baseUrl) {
    console.log("[Qdrant] skip (no QDRANT_URL and no QDRANT_HOST)");
    return;
  }

  const collection = "coby_memories";
  const apiKey = (process.env.QDRANT_API_KEY || "").trim();

  const res = await fetch(`${baseUrl}/collections/${collection}`, {
    method: "DELETE",
    headers: apiKey ? { "api-key": apiKey } : {},
  });

  if (res.status === 404) {
    console.log(`[Qdrant] collection not found: ${collection} (already empty)`);
    return;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[Qdrant] delete collection failed: ${res.status} ${text}`);
  }

  console.log(`[Qdrant] delete collection OK: ${collection}`);
}

function wipeLocalMem0History() {
  const dbPath = path.resolve(process.cwd(), "mem0_history.db");
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log("[Local] deleted mem0_history.db");
  } else {
    console.log("[Local] mem0_history.db not found (skip)");
  }
}

async function main() {
  // Load env without introducing new dependencies
  loadDotEnv(path.resolve(process.cwd(), ".env"));
  loadDotEnv(path.resolve(process.cwd(), ".env.local"));
  loadDotEnv(path.resolve(process.cwd(), ".env.production"));

  console.log("=== WIPE START (IRREVERSIBLE) ===");
  await wipeMongo();
  await wipeQdrant();
  wipeLocalMem0History();
  console.log("=== WIPE DONE ===");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


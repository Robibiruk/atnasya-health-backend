// setup-db.js — creates the atnasya_health database, collections, and indexes.
// Run with: npm run setup-db
const { MongoClient } = require("mongodb");

const uri =
  process.env.MONGODB_URI ||
  "mongodb+srv://robekmedia_db_user:ohI8im9gbweoBlyJ@cluster0.bmf0e85.mongodb.net/atnasya_health";

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("atnasya_health");
  const cols = [
    "users",
    "cycles",
    "symptoms",
    "vitals",
    "moods",
    "insights",
    "chat_messages",
    "articles",
  ];
  for (const c of cols) {
    try {
      await db.createCollection(c);
      console.log(`  created collection: ${c}`);
    } catch (e) {
      if (e.codeName === "NamespaceExists") {
        console.log(`  collection exists: ${c}`);
      } else {
        throw e;
      }
    }
  }
  await db.collection("users").createIndex({ firebaseUid: 1 }, { unique: true });
  await db.collection("cycles").createIndex({ userId: 1, periodStart: -1 });
  await db.collection("symptoms").createIndex({ userId: 1, date: -1 });
  await db.collection("vitals").createIndex({ userId: 1, date: -1 });
  await db.collection("moods").createIndex({ userId: 1, date: -1 });
  await db.collection("insights").createIndex({ userId: 1, date: -1 });
  await db
    .collection("chat_messages")
    .createIndex({ userId: 1, createdAt: -1 });
  await db.collection("articles").createIndex({ slug: 1 }, { unique: true });
  console.log("✅ atnasya_health database ready");
  await client.close();
}

main().catch((err) => {
  console.error("❌ setup-db failed:", err);
  process.exit(1);
});

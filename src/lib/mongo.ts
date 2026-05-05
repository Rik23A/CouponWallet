// CouponVault Server — MongoDB native driver connection
import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI ?? '';
const MONGODB_DB  = process.env.MONGODB_DB  ?? 'couponvault';

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not set in environment variables');
}

let client: MongoClient;
let db: Db;

export async function connectMongo(): Promise<void> {
  if (db) return; // already connected
  client = new MongoClient(MONGODB_URI, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  db = client.db(MONGODB_DB);
  console.log(`[MongoDB] Connected to database: ${MONGODB_DB}`);
}

export function getDb(): Db {
  if (!db) throw new Error('[MongoDB] Not connected. Call connectMongo() first.');
  return db;
}

// ── Generic helpers ───────────────────────────────────────────────────────────

type MongoDoc   = Record<string, unknown>;
type MongoFilter = Record<string, unknown>;

export async function findMany<T>(
  collection: string,
  filter:     MongoFilter = {},
  sort:       MongoDoc    = {},
  limit       = 50,
  skip        = 0,
): Promise<T[]> {
  return getDb()
    .collection<T & MongoDoc>(collection)
    .find(filter as any)
    .sort(sort as any)
    .skip(skip)
    .limit(limit)
    .toArray() as Promise<T[]>;
}

export async function findOne<T>(
  collection: string,
  filter:     MongoFilter,
): Promise<T | null> {
  return getDb().collection<T & MongoDoc>(collection).findOne(filter as any) as Promise<T | null>;
}

export async function insertOne(
  collection: string,
  document:   MongoDoc,
): Promise<string> {
  const res = await getDb().collection(collection).insertOne(document as any);
  return res.insertedId.toString();
}

export async function upsertOne(
  collection: string,
  filter:     MongoFilter,
  update:     MongoDoc,
): Promise<void> {
  console.log(`[MongoDB] Upserting to ${collection}:`, filter);
  await getDb().collection(collection).updateOne(
    filter as any,
    { $set: update, $setOnInsert: { created_at: new Date() } },
    { upsert: true },
  );
}

export async function incrementField(
  collection: string,
  filter:     MongoFilter,
  field:      string,
  amount      = 1,
): Promise<void> {
  await getDb().collection(collection).updateOne(
    filter as any,
    { $inc: { [field]: amount } },
  );
}

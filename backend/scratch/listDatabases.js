import { MongoClient } from 'mongodb';

const MONGODB_URI = 'mongodb+srv://abhikaroapp:abhikaro123@cluster0.u6y6z4b.mongodb.net/abhikaro';

async function main() {
  console.log('Connecting to Atlas Cluster...');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('Connected!');

  const adminDb = client.db().admin();
  const dbs = await adminDb.listDatabases();
  
  console.log('\nAll databases on this MongoDB cluster:');
  dbs.databases.forEach(db => {
    console.log(`- name: "${db.name}" | sizeOnDisk: ${db.sizeOnDisk} bytes`);
  });

  await client.close();
  console.log('Disconnected!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

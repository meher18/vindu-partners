const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:GoodWorksByVinduOz8@db.omztihguzcpkdfcxfhwk.supabase.co:5432/postgres' });
async function run() {
  await client.connect();
  try {
    const res = await client.query('SELECT * FROM kitchens');
    console.log("KITCHENS:", res.rows);
    const auth = await client.query('SELECT id, email FROM auth.users');
    console.log("USERS:", auth.rows);
    const prof = await client.query('SELECT * FROM profiles');
    console.log("PROFILES:", prof.rows);
  } catch (e) {
    console.error("ERROR:", e.message);
  }
  await client.end();
}
run();

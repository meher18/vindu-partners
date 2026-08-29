const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://omztihguzcpkdfcxfhwk.supabase.co', 'sb_publishable_Ol3wu-0u6Wyk7gUYo_HQ9Q_MTudP7xh');

async function test() {
  console.log("Checking profiles table...");
  const p = await supabase.from('profiles').select('*', { count: 'exact', head: true });
  if (p.error) console.log("Profiles error:", p.error);
  else console.log("Profiles OK. Count:", p.count);

  console.log("Checking kitchens table...");
  const k = await supabase.from('kitchens').select('*', { count: 'exact', head: true });
  if (k.error) console.log("Kitchens error:", k.error);
  else console.log("Kitchens OK. Count:", k.count);
}
test();

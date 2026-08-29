const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://omztihguzcpkdfcxfhwk.supabase.co';
const supabaseKey = 'sb_publishable_Ol3wu-0u6Wyk7gUYo_HQ9Q_MTudP7xh';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Signing up test user...");
  const { data, error } = await supabase.auth.signUp({
    email: 'kitchen1@gmail.com',
    password: 'password123',
    options: {
      data: {
        full_name: 'Test Vendor'
      }
    }
  });
  
  if (error) {
    console.error("Signup error:", error.message);
    return;
  }
  
  console.log("User signed up! ID:", data.user.id);
  
  if (data.session == null) {
    console.log("Email confirmation is REQUIRED. Cannot proceed automatically.");
  } else {
    console.log("Session created automatically!");
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: 'vendor' })
      .eq('id', data.user.id);
      
    if (updateError) {
      console.error("Error updating role:", updateError.message);
    } else {
      console.log("Role successfully updated to vendor!");
    }
  }
}
run();

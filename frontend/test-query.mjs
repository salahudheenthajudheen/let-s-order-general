import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function test() {
  const email = "consumer@sal.com";
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone')
    .or(`name.eq."${email}",phone.eq."${email}"`);
  
  if (error) {
    console.error("FORMAT ERROR:", JSON.stringify(error));
  } else {
    console.log("SUCCESS Data:", data);
  }
}

test();

// scripts/migrate-credentials-to-encrypted.ts
// Migration script to encrypt existing plaintext credentials

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { encryptCredentials, isEncrypted } from '../supabase/functions/_shared/encryption.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ENCRYPTION_KEY = Deno.env.get('CMS_CREDENTIALS_ENCRYPTION_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  Deno.exit(1);
}

if (!ENCRYPTION_KEY) {
  console.error('❌ Missing CMS_CREDENTIALS_ENCRYPTION_KEY environment variable');
  console.error('   This is required to encrypt credentials');
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function migrateCredentials() {
  console.log('🔄 Starting credential migration...');
  console.log(`   Encryption Key: ${ENCRYPTION_KEY.substring(0, 10)}...`);
  console.log('');
  
  // Fetch all blogs with credentials
  const { data: blogs, error } = await supabase
    .from('blogs')
    .select('id, cms_credentials, cms_platform')
    .not('cms_credentials', 'is', null);
  
  if (error) {
    console.error('❌ Error fetching blogs:', error);
    Deno.exit(1);
  }
  
  if (!blogs || blogs.length === 0) {
    console.log('✅ No blogs with credentials found');
    return;
  }
  
  console.log(`📊 Found ${blogs.length} blogs with credentials`);
  console.log('');
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const blog of blogs) {
    try {
      const credentials = blog.cms_credentials;
      
      // Check if already encrypted
      if (typeof credentials === 'string') {
        if (isEncrypted(credentials)) {
          console.log(`⏭️  Blog ${blog.id} (${blog.cms_platform}) already encrypted, skipping`);
          skipped++;
          continue;
        }
      } else if (typeof credentials === 'object') {
        // Check if it's a plain object (not encrypted)
        // Encrypted credentials are always strings
        // Plain objects need to be encrypted
      }
      
      // Encrypt credentials
      console.log(`🔒 Encrypting credentials for blog ${blog.id} (${blog.cms_platform})...`);
      const encrypted = await encryptCredentials(credentials);
      
      // Update database
      const { error: updateError } = await supabase
        .from('blogs')
        .update({ cms_credentials: encrypted })
        .eq('id', blog.id);
      
      if (updateError) {
        console.error(`❌ Error updating blog ${blog.id}:`, updateError);
        errors++;
      } else {
        console.log(`✅ Migrated blog ${blog.id}`);
        migrated++;
      }
    } catch (error: any) {
      console.error(`❌ Error processing blog ${blog.id}:`, error.message);
      errors++;
    }
  }
  
  console.log('');
  console.log('📊 Migration Summary:');
  console.log(`   ✅ Migrated: ${migrated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📝 Total: ${blogs.length}`);
  
  if (errors > 0) {
    console.log('');
    console.warn('⚠️  Some credentials failed to migrate. Please review errors above.');
    Deno.exit(1);
  }
}

// Run migration
migrateCredentials().catch((error) => {
  console.error('❌ Migration failed:', error);
  Deno.exit(1);
});


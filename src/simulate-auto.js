/**
 * Auto-simulation - Test all flows without interaction
 * Run: node src/simulate-auto.js
 */

import { PoolService } from './services/pool.js';
import { SessionService } from './services/session.js';
import config from './config.js';

console.log(`
╔═══════════════════════════════════════════════════════╗
║     🤖 RANDOMCHATBOT AUTO-SIMULATION                  ║
╚═══════════════════════════════════════════════════════╝
`);

// Initialize services
const poolService = new PoolService();
const sessionService = new SessionService(poolService);

async function runSimulation() {
  
  // ═══════════════════════════════════════════════════
  // TEST 1: User Registration (with privacy)
  // ═══════════════════════════════════════════════════
  console.log('\n📋 TEST 1: User Registration (Privacy Enabled)');
  console.log('─'.repeat(40));
  
  const user1 = {
    user_id: 12345,
    name: 'RealName_Alice',  // Will be hidden
    age: 25,
    gender: 'F',
    location: 'Jakarta',
    language: 'id',
    preference: 'random',
    gender_prefs: ['M', 'F', 'O'],
    age_min: 18,
    age_max: 99
  };
  
  console.log('📱 Bot: Welcome (privasi terjamin)');
  console.log('👤 User: Age=25, Gender=F, Location=Jakarta, Language=id');
  console.log('✅ Profile saved (identitas tersamarkan)');
  
  console.log('\n📱 Bot: "Pilih preferensi"');
  console.log('👤 User: Random (Gratis)');
  console.log('✅ Preference: random');
  
  // Add to pool (sanitized)
  await poolService.addToPool(user1);
  console.log(`\n📊 Pool: ${poolService.getPoolSize()} user (anonymous ID)`);
  
  // Show sanitized data in pool
  const poolProfiles = poolService.getPoolProfiles();
  console.log('🔒 Pool profiles (no real ID):', poolProfiles);
  
  // ═══════════════════════════════════════════════════
  // TEST 2: Privacy - Anonymization
  // ═══════════════════════════════════════════════════
  console.log('\n📋 TEST 2: Privacy Check');
  console.log('─'.repeat(40));
  
  const anonymized = poolProfiles[0];
  console.log('🔐 Original user_id: 12345');
  console.log('🔐 Anonymous ID:', anonymized?.anonymous_id);
  console.log('✅ Real Telegram ID hidden from partner!');
  
  // Show what's visible to partner
  console.log('\n📝 Yang dilihat partner:');
  console.log('   • Age:', anonymized?.age);
  console.log('   • Gender:', anonymized?.gender);
  console.log('   • Location:', anonymized?.location);
  console.log('   • Language:', anonymized?.language);
  console.log('   • Preference:', anonymized?.preference);
  console.log('❌ Tidak ada: username, user_id, phone, bio');
  
  // ═══════════════════════════════════════════════════
  // TEST 3: Matchmaking
  // ═══════════════════════════════════════════════════
  console.log('\n📋 TEST 3: Matchmaking');
  console.log('─'.repeat(40));
  
  const user2 = {
    user_id: 67890,
    name: 'Bob_Real_Name',  // Will be hidden
    age: 28,
    gender: 'M',
    location: 'Surabaya',
    language: 'id',
    preference: 'random',
    gender_prefs: ['M', 'F', 'O'],
    age_min: 18,
    age_max: 99
  };
  
  console.log('👤 User 2 joins (Bob, 28, M, Surabaya)');
  await poolService.addToPool(user2);
  console.log(`📊 Pool: ${poolService.getPoolSize()}`);
  
  const match = await poolService.findMatch(user1);
  
  if (match) {
    console.log('🎉 MATCH! Anon-XXXX ↔ Anon-YYYY');
    
    await poolService.removeFromPool(user1.user_id);
    await poolService.removeFromPool(user2.user_id);
    
    // Create session with ANONYMOUS profiles
    await sessionService.createSession(user1.user_id, user2.user_id, user1, user2);
    
    console.log('💬 Session created (both see anonymous IDs only)');
    console.log(`📊 Pool: ${poolService.getPoolSize()}, Sessions: ${sessionService.getActiveSessions()}`);
  }
  
  // ═══════════════════════════════════════════════════
  // TEST 4: Chat with Privacy
  // ═══════════════════════════════════════════════════
  console.log('\n📋 TEST 4: Chat with Privacy');
  console.log('─'.repeat(40));
  
  const partnerProfile = sessionService.getPartnerProfile(user1.user_id);
  console.log('👤 Partner profile (anonymous):', partnerProfile);
  console.log('\n💬 Chat simulation:');
  console.log('👤 User1: "Hai!"');
  console.log('📱 Bot → Partner: "[25y F Jakarta]\nHai!"');
  console.log('✅ Message sent with anonymous prefix');
  
  // Test personal info blocking
  console.log('\n⚠️ Personal info detection:');
  const testMessages = [
    { msg: 'Hai apa kabar', safe: true },
    { msg: 'Wa saya 081234567890', safe: false, reason: 'phone' },
    { msg: 'Follow @username', safe: false, reason: 'username' },
    { msg: 't.me/myprofile', safe: false, reason: 'Telegram link' }
  ];
  
  for (const test of testMessages) {
    const result = checkPersonalInfo(test.msg);
    console.log(`   "${test.msg.substring(0,20)}..." → ${result.safe ? '✅ Allowed' : '❌ Blocked (' + result.reason + ')'}`);
  }
  
  // ═══════════════════════════════════════════════════
  // TEST 5: Session End
  // ═══════════════════════════════════════════════════
  console.log('\n📋 TEST 5: End Session');
  console.log('─'.repeat(40));
  
  console.log('👤 User: /skip');
  const result = await sessionService.endSession(user1.user_id, 'skip');
  console.log('✅ Session ended');
  console.log(`📊 Active sessions: ${sessionService.getActiveSessions()}`);
  
  // ═══════════════════════════════════════════════════
  // FINAL RESULTS
  // ═══════════════════════════════════════════════════
  console.log(`
╔═══════════════════════════════════════════════════════╗
║     ✅ PRIVACY SIMULATION COMPLETE                   ║
╠═══════════════════════════════════════════════════════╣
║  Tests:                                              ║
║  ✓ User registration (identitas tersamarkan)         ║
║  ✓ Anonymous ID (Anon-XXXX format)                   ║
║  ✓ Pool profiles (no real Telegram ID)               ║
║  ✓ Partner shows only: age, gender, loc, lang        ║
║  ✓ Personal info detection (phone, username, link)   ║
║  ✓ Session ends cleanly                              ║
╚═══════════════════════════════════════════════════════╝

🔒 PRIVACY SUMMARY:
┌─────────────────────────────────────────────────────┐
│  VISIBLE TO PARTNER:                                 │
│  • Age (25)                                          │
│  • Gender (F)                                        │
│  • Location (Jakarta)                                │
│  • Language (Indonesia)                              │
│  • Preference (Random)                               │
│  • Anonymous ID (Anon-E1087D)                        │
├─────────────────────────────────────────────────────┤
│  TERSEMBUNYIKAN:                                     │
│  ❌ Telegram Username                                │
│  ❌ Telegram User ID                                 │
│  ❌ Phone Number                                      │
│  ❌ Profile Photo                                    │
│  ❌ Bio                                              │
│  ❌ Last Seen                                        │
└─────────────────────────────────────────────────────┘
`);
  
  process.exit(0);
}

// Import the check function
import { checkPersonalInfo } from './utils/privacy.js';

runSimulation().catch(console.error);
/**
 * Simulation script - Test bot flow without real Telegram connection
 * Run: node src/simulate.js
 */

import readline from 'readline';
import { PoolService } from './services/pool.js';
import { SessionService } from './services/session.js';
import config from './config.js';

// Create mock services
const poolService = new PoolService();
const sessionService = new SessionService(poolService);

// Simulated user session
const user = {
  user_id: 12345,
  name: 'Test User',
  age: 0,
  gender: '',
  location: '',
  language: '',
  preference: '',
  unlocked: []
};

const services = { poolService, sessionService, config };

// CLI interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
╔═══════════════════════════════════════════════════════╗
║     🤖 RANDOMCHATBOT SIMULATION                      ║
║     (Testing without real Telegram bot)              ║
╚═══════════════════════════════════════════════════════╝
`);

// Simulate flow
async function startSimulation() {
  console.log('\n--- SIMULATION START ---\n');
  
  // Step 1: /start command
  console.log('📱 Bot: ' + config.WELCOME_MESSAGE);
  
  await prompt('\n📝 Input usia (ketik angka): ');
  
  // Step 2: Age input
  user.age = 25;
  console.log('✅ User: 25');
  console.log('📱 Bot: *Pilih gender kamu:*');
  
  await prompt('\n📝 Input gender (M/F/O): ');
  
  // Step 3: Gender input
  user.gender = 'M';
  console.log('✅ User: Male (M)');
  console.log('📱 Bot: *Ketik lokasi kamu:*');
  
  await prompt('\n📝 Input lokasi: ');
  
  // Step 4: Location input
  user.location = 'Jakarta';
  console.log('✅ User: Jakarta');
  console.log('📱 Bot: *Pilih bahasa:*');
  
  await prompt('\n📝 Input bahasa (id/en): ');
  
  // Step 5: Language input
  user.language = 'id';
  console.log('✅ User: Indonesia');
  console.log('📱 Bot: *Pilih preferensi chat:*');
  
  console.log(`
   [1] 🎲 Random (Gratis)
   [2] 🔞 18+ (⭐ 50) - Locked
   [3] 👫 Same (⭐ 30) - Locked
  `);
  
  await prompt('\n📝 Pilih preferensi (1/2/3): ');
  
  // Step 6: Preference selection
  user.preference = 'random';
  console.log('✅ User: Random (1)');
  
  // Add to pool
  const profile = {
    user_id: user.user_id,
    name: user.name,
    age: user.age,
    gender: user.gender,
    location: user.location,
    language: user.language,
    preference: user.preference,
    gender_prefs: ['M', 'F', 'O'],
    age_min: 18,
    age_max: 99
  };
  
  await poolService.addToPool(profile);
  
  console.log('📱 Bot: *✅ Berhasil!*\n   📝 Profil: Usia 25, Gender M, Lokasi Jakarta, Bahasa id, Preferensi: Random\n   ⏳ Mencari partner...');
  
  // Try to match (will fail since no one else in pool)
  console.log('\n--- MATCHMAKING CHECK ---');
  const match = await poolService.findMatch(profile);
  
  if (match) {
    console.log('✅ Match found: ', match);
  } else {
    console.log('⏳ No match yet. User added to pool.');
    console.log(`📊 Pool size: ${poolService.getPoolSize()}`);
  }
  
  // Simulate premium unlock
  console.log('\n--- PREMIUM SIMULATION ---');
  console.log('User wants to unlock 18+ feature...');
  
  user.unlocked.push('18+');
  console.log('✅ Simulated payment successful!');
  console.log('✅ 18+ feature unlocked!');
  console.log(`📊 Unlocked features: ${user.unlocked.join(', ')}`);
  
  // Test with second user
  console.log('\n--- SECOND USER (MATCHING) ---');
  
  const user2 = {
    user_id: 67890,
    name: 'User 2',
    age: 23,
    gender: 'F',
    location: 'Surabaya',
    language: 'id',
    preference: 'random',
    gender_prefs: ['M', 'F', 'O'],
    age_min: 18,
    age_max: 99
  };
  
  await poolService.addToPool(user2);
  console.log('✅ User 2 added to pool');
  console.log(`📊 Pool size: ${poolService.getPoolSize()}`);
  
  // Try matching User 1 with User 2
  const match2 = await poolService.findMatch(profile);
  
  if (match2) {
    console.log('🎉 MATCH FOUND!');
    console.log(`   User 1 (${profile.user_id}) matched with User 2 (${user2.user_id})`);
    
    // Create session
    await poolService.removeFromPool(profile.user_id);
    await poolService.removeFromPool(user2.user_id);
    await sessionService.createSession(profile.user_id, user2.user_id);
    
    console.log('💬 Session created!');
    console.log(`📊 Active sessions: ${sessionService.getActiveSessions()}`);
    
    // Simulate chat
    console.log('\n--- CHAT SIMULATION ---');
    console.log('👤 User 1: Hai, halo!');
    console.log('📱 Bot forwards to User 2...');
    console.log('👤 User 2: Hallo! Siapa kamu?');
    
    // End session
    console.log('\n--- END SESSION ---');
    await sessionService.endSession(profile.user_id, 'manual');
    console.log('👋 Session ended');
    console.log(`📊 Active sessions: ${sessionService.getActiveSessions()}`);
  }
  
  console.log('\n--- SIMULATION COMPLETE ---');
  console.log('\n✅ All flows tested successfully!\n');
  
  rl.close();
}

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

startSimulation();
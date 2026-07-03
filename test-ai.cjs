// Test AI Service Connection - Direct Test
const { testAIConnection } = require('./src/services/aiService');

(async () => {
  try {
    console.log('Testing AI Service Connection...');
    const result = await testAIConnection();
    console.log('Test Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('✅ AI Service is working correctly!');
      process.exit(0);
    } else {
      console.log('❌ AI Service Connection Failed:');
      console.log('Error:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Test Error:', error);
    process.exit(1);
  }
})();

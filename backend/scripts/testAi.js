const { askCsAi } = require('../dist/services/aiChat');

(async () => {
  try {
    const res = await askCsAi('Halo, aku mau tanya tentang menu ayam geprek');
    console.log('AI reply:', res);
  } catch (err) {
    console.error('Test failed:', err);
  }
})();

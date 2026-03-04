const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function check() {
  try {
    const snapshot = await db.collection('todos').get();
    console.log('Total docs in Firebase:', snapshot.docs.length);
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log('Doc:', doc.id);
      console.log('  text:', data.text);
      console.log('  createdAt:', data.createdAt);
      console.log('  ---');
    });
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

check();

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function check() {
  try {
    // 尝试读取
    const snapshot = await db.collection('todos').get();
    console.log('Read success, docs count:', snapshot.docs.length);
    snapshot.docs.forEach(doc => {
      console.log('  -', doc.id, doc.data().text);
    });
    
    // 尝试写入测试文档
    const testDoc = await db.collection('todos').add({
      text: 'Test from server',
      importance: 0.5,
      reason: 'Test',
      createdAt: new Date()
    });
    console.log('Write success, doc ID:', testDoc.id);
    
    // 删除测试文档
    await testDoc.delete();
    console.log('Delete success');
    
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
}

check();

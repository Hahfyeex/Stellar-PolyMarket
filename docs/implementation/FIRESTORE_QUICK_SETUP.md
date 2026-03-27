# Firestore Live Comments - Quick Setup Guide

## 🚀 5-Minute Setup

### 1. Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
firebase login
```

### 2. Initialize Firebase in Your Project

```bash
firebase init firestore
# Select your Firebase project
# Accept default firestore.rules and firestore.indexes.json
```

### 3. Deploy Security Rules and Indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 4. Add Environment Variables

Create `.env.local` in the `frontend` directory:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Get these values from:
- Firebase Console → Project Settings → General → Your apps → Web app

### 5. Use the Component

```tsx
import MarketComments from '@/components/MarketComments';

function MarketPage() {
  const marketId = 123;
  const walletAddress = "GAXYZ..."; // or null if not connected
  
  return (
    <div>
      {/* Your market content */}
      <MarketComments 
        marketId={marketId} 
        walletAddress={walletAddress} 
      />
    </div>
  );
}
```

### 6. Test It!

```bash
# Start your Next.js app
cd frontend
npm run dev

# Open in two browsers
# Browser 1: http://localhost:3000
# Browser 2: http://localhost:3000 (incognito)

# Post a comment in Browser 1
# Watch it appear instantly in Browser 2!
```

## 🧪 Test Security Rules (Optional)

### 1. Install Test Dependencies

```bash
npm install --save-dev @firebase/rules-unit-testing
```

### 2. Start Firestore Emulator

```bash
firebase emulators:start --only firestore
```

### 3. Run Tests (in another terminal)

```bash
npm test -- --config jest.firestore.config.js
```

Expected output:
```
Test Suites: 1 passed, 1 total
Tests:       27 passed, 27 total
Coverage:    95%+
```

## 🔧 Troubleshooting

### Issue: "Missing or insufficient permissions"

**Solution**: Deploy security rules
```bash
firebase deploy --only firestore:rules
```

### Issue: "Index not found"

**Solution**: Deploy indexes
```bash
firebase deploy --only firestore:indexes
```

Or create manually in Firebase Console:
- Go to Firestore → Indexes
- Create composite index:
  - Collection: `marketComments`
  - Fields: `marketId` (Ascending), `createdAt` (Descending)

### Issue: Comments not appearing in real-time

**Solution**: Check Firebase configuration
1. Verify environment variables in `.env.local`
2. Check browser console for errors
3. Ensure Firestore is enabled in Firebase Console

### Issue: "Firebase app not initialized"

**Solution**: Check import
```tsx
import { db } from '@/lib/firebase';
```

Ensure `firebase.ts` exports `db`:
```tsx
export { app, db, messaging, getToken, onMessage };
```

## 📊 Verify Setup

### 1. Check Firestore Console

- Go to Firebase Console → Firestore Database
- You should see `marketComments` collection after first comment
- Click on a document to see the structure

### 2. Check Security Rules

- Go to Firebase Console → Firestore Database → Rules
- You should see the deployed rules
- Click "Publish" if they're not active

### 3. Check Indexes

- Go to Firebase Console → Firestore Database → Indexes
- You should see the composite index
- Status should be "Enabled" (may take a few minutes)

## 🎯 Quick Test Checklist

- [ ] Firebase CLI installed
- [ ] Security rules deployed
- [ ] Indexes created
- [ ] Environment variables set
- [ ] Component imported
- [ ] App running
- [ ] Can post comment
- [ ] Comment appears in Firestore Console
- [ ] Real-time sync works across browsers
- [ ] Pagination works

## 📚 Next Steps

1. Read `FIRESTORE_COMMENTS_README.md` for detailed documentation
2. Review `firestore.rules` to understand security
3. Check `firestore.test.rules` for test examples
4. Customize styling in `MarketComments.tsx`
5. Add to your market detail pages

## 🆘 Need Help?

- **Documentation**: See `FIRESTORE_COMMENTS_README.md`
- **Security Rules**: See `firestore.rules` with comments
- **Tests**: See `firestore.test.rules` for examples
- **Firebase Docs**: https://firebase.google.com/docs/firestore

## ⚡ Pro Tips

1. **Development**: Use Firestore emulator for local testing
   ```bash
   firebase emulators:start --only firestore
   ```

2. **Production**: Set up billing alerts in Firebase Console

3. **Monitoring**: Enable Firestore monitoring in Firebase Console

4. **Backup**: Set up automated backups in Firebase Console

5. **Security**: Review security rules regularly

---

**Setup Time**: ~5 minutes  
**Difficulty**: Easy  
**Prerequisites**: Firebase project, Node.js installed

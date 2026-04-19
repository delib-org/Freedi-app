import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  DocumentReference,
  CollectionReference,
  QueryConstraint,
  Unsubscribe,
} from 'firebase/firestore';
import {
  getAuth,
  Auth,
  connectAuthEmulator,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  onAuthStateChanged,
  User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

function init(): void {
  if (getApps().length > 0) {
    app = getApp();
  } else {
    app = initializeApp(firebaseConfig);
  }

  db = getFirestore(app);
  auth = getAuth(app);

  const isLocalhost =
    typeof window !== 'undefined' && window.location.hostname === 'localhost';

  if (isLocalhost) {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099', {
        disableWarnings: true,
      });
    } catch (error) {
      console.error('[Firebase] Auth emulator connection failed:', error);
    }
    try {
      connectFirestoreEmulator(db, 'localhost', 8081);
    } catch (error) {
      console.error('[Firebase] Firestore emulator connection failed:', error);
    }
  }
}

init();

export {
  app,
  db,
  auth,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  onAuthStateChanged,
};

export type {
  User,
  DocumentReference,
  CollectionReference,
  QueryConstraint,
  Unsubscribe,
};

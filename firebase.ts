// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import * as FirebaseAuth from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries
const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[Firebase] Missing env var: ${name}`);
  }
  return value;
};

const firebaseConfig = {
  apiKey: requiredEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: requiredEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: requiredEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: requiredEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requiredEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requiredEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Initialize Storage
export const storage = getStorage(app);

type ReactNativePersistenceFn = (
  storage: typeof AsyncStorage,
) => FirebaseAuth.Persistence;

export const auth =
  Platform.OS === "web"
    ? FirebaseAuth.getAuth(app)
    : (() => {
        const getReactNativePersistence = (
          FirebaseAuth as unknown as {
            getReactNativePersistence?: ReactNativePersistenceFn;
          }
        ).getReactNativePersistence;

        try {
          return FirebaseAuth.initializeAuth(app, {
            persistence: getReactNativePersistence?.(AsyncStorage),
          });
        } catch {
          // Fallback when Auth was already initialized (e.g. Fast Refresh).
          return FirebaseAuth.getAuth(app);
        }
      })();

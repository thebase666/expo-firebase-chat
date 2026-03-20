import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Firebase Auth state listener
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Email/password login
  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  // Email/password registration
  const register = async (email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    const uid = credential.user.uid;
    const nickname = email.split("@")[0] || "New User";
    // listener ----- is waiting for the user state changes and make router change
    // async function ----- will still run even user state changes and router changes

    await setDoc(
      // need better choice : use cloud function to create the user profile in server side, because setDoc may fail in client side because of network issues or other reasons
      // and this is something valuable , and I will give it for free in next video. please hit the like button.
      doc(db, "users", uid),
      {
        uid,
        email,
        nickname,
        avatarUrl: "",
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  };

  // Logout
  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
/**
 * useAuth hook
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

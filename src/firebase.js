import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA_bxIhdcVmqkOkkySKx3_QNLLSYQh6M3I",
  authDomain: "trial-9-f50a4.firebaseapp.com",
  projectId: "trial-9-f50a4",
  storageBucket: "trial-9-f50a4.firebasestorage.app",
  messagingSenderId: "766267658810",
  appId: "1:766267658810:web:da47b2d9d3857151e29b03",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

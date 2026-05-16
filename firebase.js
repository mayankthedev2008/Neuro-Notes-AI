const firebaseConfig = {
  apiKey: "AIzaSyCm_xPJCyalzBhjCfNZvas6dOf_McqWcAk",
  authDomain: "neuro-notes-ai.firebaseapp.com",
  projectId: "neuro-notes-ai",
  storageBucket: "neuro-notes-ai.firebasestorage.app",
  messagingSenderId: "849983880592",
  appId: "1:849983880592:web:a48b5dfc4b6de54e344715",
  measurementId: "G-7W4Q7MJ58E"
};

const GEMINI_API_KEY = "AIzaSyAOf6m3JsRUnAAFtL3IcN0eSZjo2AnPXZA";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

async function callGemini(prompt) {
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  const res = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("Gemini API error: " + res.status);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

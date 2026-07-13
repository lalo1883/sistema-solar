import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { addDoc, collection, doc, getFirestore, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyCrzy1XyUZrVvskmi8Rn2UOxqm6k3cIyjI",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "ley2027-85fa8.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "ley2027-85fa8",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "ley2027-85fa8.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "244462336751",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:244462336751:web:aaafda6d67ef66896c791a",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-YXEQ0LM659",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

let analyticsPromise: Promise<Analytics | null> | null = null;

export function initializeAnalytics() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = isSupported().then((supported) => supported ? getAnalytics(firebaseApp) : null);
  }
  return analyticsPromise;
}

export async function uploadProjectDocument(file: File, project: string) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const objectRef = ref(storage, `documents/${Date.now()}-${safeName}`);
  const snapshot = await uploadBytes(objectRef, file, { contentType: file.type || "application/octet-stream" });
  const downloadUrl = await getDownloadURL(snapshot.ref);

  const record = await addDoc(collection(db, "documents"), {
    name: file.name,
    project,
    storagePath: snapshot.ref.fullPath,
    downloadUrl,
    contentType: file.type || null,
    size: file.size,
    status: "uploaded",
    createdAt: serverTimestamp(),
  });

  return { id: record.id, downloadUrl, storagePath: snapshot.ref.fullPath };
}

export async function createProjectRecord(input: { name: string; area: string; owner: string; status: string }) {
  const record = await addDoc(collection(db, "projects"), {
    name: input.name.trim(),
    area: input.area.trim(),
    owner: input.owner.trim(),
    progress: 0,
    risk: "Sin evaluar",
    status: input.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return record.id;
}

export async function createTaskRecord(input: { title: string; description: string; projectId: string; projectName: string; assignee: string; status: string; priority: string; dueDate: string }) {
  const record = await addDoc(collection(db, "tasks"), {
    title: input.title.trim(),
    description: input.description.trim(),
    projectId: input.projectId,
    projectName: input.projectName,
    assignee: input.assignee,
    status: input.status,
    priority: input.priority,
    dueDate: input.dueDate || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return record.id;
}

export async function updateTaskStatus(taskId: string, status: string) {
  await updateDoc(doc(db, "tasks", taskId), { status, updatedAt: serverTimestamp() });
}

export async function updateTaskDescription(taskId: string, description: string) {
  await updateDoc(doc(db, "tasks", taskId), { description: description.trim(), updatedAt: serverTimestamp() });
}

export async function updateProjectSteps(projectId: string, steps: { id: string; text: string; done: boolean }[]) {
  await updateDoc(doc(db, "projects", projectId), { nextSteps: steps, updatedAt: serverTimestamp() });
}

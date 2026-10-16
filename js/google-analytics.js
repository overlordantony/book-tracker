// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-analytics.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyBFSITP4biT1KzHmczugw2o2ahPoJtQwaM",
    authDomain: "book-tracker-overlordowl.firebaseapp.com",
    projectId: "book-tracker-overlordowl",
    storageBucket: "book-tracker-overlordowl.firebasestorage.app",
    messagingSenderId: "27081685438",
    appId: "1:27081685438:web:5293d4bf769049cf54e1ef",
    measurementId: "G-KQJBK8K31L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
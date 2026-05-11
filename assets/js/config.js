// ── Brevo Config — managed via Settings → Integrations ──
  // Free at https://brevo.com — 300 emails/day, supports attachments
  var BREVO_API_KEY = localStorage.getItem('brevo_api_key') || '';

var _fbConfig = {
    apiKey: "AIzaSyDswSLf0pXwnb2U_f2ZcWEdl0VhS4Fguig",
    authDomain: "nova-studio-494013.firebaseapp.com",
    projectId: "nova-studio-494013",
    storageBucket: "nova-studio-494013.firebasestorage.app",
    messagingSenderId: "220209403713",
    appId: "1:220209403713:web:44cfc2d176c07dfa8173c0",
    measurementId: "G-DB3D4QTZ8P"
  };
  firebase.initializeApp(_fbConfig);
  var fbAuth    = firebase.auth();
  var fbDb      = firebase.firestore();
  var fbStorage = firebase.storage();

export const SESSION = "fieldbook.profile.v1";
export const DEMO_PROFILE_IDS = [
  "demo-learner",
  "demo-manager",
  "demo-contributor",
  "demo-admin",
];

// Presentation hint only. Restoring the workspace still validates the account.
// Run during HTML parsing, before React or any account UI can paint.
export const demoSessionScript = `(function(){try{var profile=sessionStorage.getItem(${JSON.stringify(SESSION)});if(${JSON.stringify([...DEMO_PROFILE_IDS, "guest"])}.includes(profile))document.documentElement.setAttribute("data-demo-session","resume")}catch(e){}})()`;

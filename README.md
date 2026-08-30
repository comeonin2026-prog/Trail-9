# The Register

A shared student/exam tracker app — built to replace the paper register books.
Runs as a real Android app, and everyone (your friend + the friends helping her)
sees the same live data on their own phone.

This README is written for someone doing this for the first time — follow it top
to bottom, in order.

---

## ⚠️ Important — this app will hold sensitive data (Aadhar numbers, DOB)

- Keep your GitHub repo **Private** (there's a toggle for this when you create it).
- Follow the Firestore security rules step below exactly — don't skip it.
- This setup is right-sized for a small trusted group of people, not a
  public product. It is not bank-grade security.

---

## Part 1 — Create a free Firebase project (~10 min)

Firebase is what makes the data sync across everyone's phones live.

1. Go to https://console.firebase.google.com and sign in with any Google account.
2. Click **Add project**, give it any name (e.g. "the-register"), and finish
   the wizard (you can turn off Google Analytics — not needed).
3. In the left sidebar, click **Build → Firestore Database → Create database**.
   Choose any nearby region, and start in **production mode**.
4. In the left sidebar, click **Build → Authentication → Get started**.
   Under "Sign-in method", enable **Anonymous**. This lets the app connect
   without anyone needing to create a login.
5. Click the **⚙️ gear icon → Project settings**, scroll to "Your apps",
   click the **</> (web)** icon, register an app (any nickname), and copy the
   `firebaseConfig` object it shows you — you'll need it in Part 2.
6. Back in **Firestore Database → Rules**, replace the contents with this and
   click **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /register/{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

   This means: only someone who has opened the app (and been signed in
   anonymously) can read or write the data — not the entire internet.

---

## Part 2 — Add your Firebase keys to the project

1. Open `src/firebase.js` in this project.
2. Replace the placeholder values with the real values from the
   `firebaseConfig` object you copied in step 5 above. It's just pasting six
   lines in — nothing else in that file needs to change.

(Note: these values are meant to be public in a Firebase web app — the
Firestore rules above are what actually protects the data, not secrecy of
these keys.)

---

## Part 3 — Push this project to GitHub

1. Create a **new, Private** repository on GitHub (e.g. "the-register").
2. From a terminal, inside this project folder:

   ```
   git init
   git add .
   git commit -m "Initial version"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/the-register.git
   git push -u origin main
   ```

That's it — pushing to `main` automatically triggers Part 4.

---

## Part 4 — Get the Android app (automatic, via GitHub Actions)

This repo includes a workflow (`.github/workflows/build-android.yml`) that
builds an installable Android APK for you automatically — no Android Studio
needed on your own computer.

1. On GitHub, open your repo → the **Actions** tab. You'll see a run in
   progress ("Build Android APK") — it takes about 3–5 minutes.
2. Once it finishes (green checkmark), go to the **Releases** section on the
   right side of your repo's main page (or the repo's `/releases` page).
3. Download the `app-debug.apk` file from the latest release, directly on the
   Android phone (or transfer it over after downloading on a computer).

### Installing the APK on Android

1. Open the downloaded `app-debug.apk` file (from Downloads, or wherever it
   was saved).
2. Android will ask to allow installing from this source — tap **Settings**,
   turn on **Allow from this source**, then go back and tap **Install**.
3. Open "The Register" from the app drawer like any other app.

Repeat the download + install step on each phone that needs the app — they'll
all sync through the same Firebase project.

### Re-running the build later

Any time you push a change to `main`, a new APK is built automatically. You
can also trigger a build manually from the **Actions** tab → "Build Android
APK" → **Run workflow**.

---

## What's in this project

- `src/App.jsx` — the whole app (dashboard, students, accounts, exam dates).
- `src/firebase.js` — the only file you edit; connects the app to your
  Firebase project.
- `capacitor.config.json` — wraps the web app as a native Android app.
- `.github/workflows/build-android.yml` — builds the APK automatically.

### Running it in a browser instead (for testing)

```
npm install
npm run dev
```

Opens at `http://localhost:5173`.

### Deploying it to a real web URL (optional — for testing on your phone's browser)

The Android app doesn't need this at all (Capacitor bundles the built files
directly into the APK). This is only if you also want a normal website link
you can open in any browser.

**Important:** never point a host at your raw repo/source files — you must
build the project first and deploy the `dist` folder that gets created.
Opening the unbuilt source (e.g. `/src/main.jsx` directly) is what causes a
blank page with a `404 Not Found` error. This is almost certainly what
happened if you turned on GitHub Pages pointing at your `main` branch
directly — GitHub Pages by default just serves your raw files as-is, and
this project needs a build step first.

**If you're using GitHub Pages (recommended, since that's what you're
already on):**

This repo now includes `.github/workflows/deploy-pages.yml`, which builds the
project correctly and publishes it automatically. One-time setup:

1. On GitHub, go to your repo → **Settings → Pages**.
2. Under "Build and deployment" → **Source**, choose **GitHub Actions**
   (not "Deploy from a branch" — that's the setting that was serving your raw
   source files before).
3. Push this updated code to `main`. Go to the **Actions** tab and watch
   "Deploy to GitHub Pages" run (~1–2 min).
4. Once it finishes, go back to **Settings → Pages** — it will show your live
   URL at the top (something like `https://your-username.github.io/your-repo/`).

Any future push to `main` will redeploy it automatically.

**If you'd rather use Firebase Hosting instead** (you already have the
project from Part 1):

```
npm install -g firebase-tools
firebase login
firebase use --add        # pick your Firebase project, alias it "default"
npm run build              # creates the dist/ folder
firebase deploy --only hosting
```

It will print a URL like `https://your-project.web.app`.



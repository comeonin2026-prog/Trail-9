import React, { useState, useEffect, useMemo, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { db, auth } from "./firebase";

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

const LEVELS = [1, 2, 3, 4, 5, 6, 7];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);

function emptyData() {
  return { accounts: [], students: [], exams: {} };
}

function blankStudent() {
  return {
    id: "",
    rollNumber: "",
    nameEn: "",
    nameHi: "",
    fatherEn: "",
    fatherHi: "",
    dob: "",
    aadhar: "",
    level: 1,
    accountId: "",
    feesPaid: false,
    booksGiven: false,
    status: "active", // active | dropped | completed
    dropNote: "",
    history: [],
    createdAt: todayISO(),
  };
}

function isMissingDetails(s) {
  return !s.nameEn || !s.nameHi || !s.fatherEn || !s.fatherHi || !s.dob || !s.aadhar || !s.accountId;
}

// Google Input Tools transliteration API — the same engine behind Google's
// Indic keyboards. Converts each space-separated word from Roman script into
// phonetic Hindi (Devanagari), which is what's wanted for names (not a
// meaning-translation).
async function transliterateGoogle(text) {
  const words = text.trim().split(/\s+/);
  const results = await Promise.all(
    words.map(async (word) => {
      const url =
        "https://inputtools.google.com/request?text=" +
        encodeURIComponent(word) +
        "&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Google transliteration request failed");
      const data = await res.json();
      const suggestion = data && data[0] === "SUCCESS" && data[1] && data[1][0] && data[1][0][1] && data[1][0][1][0];
      if (!suggestion) throw new Error("No suggestion returned");
      return suggestion;
    })
  );
  return results.join(" ");
}

async function transliterateToHindi(text) {
  if (!text || !text.trim()) return "";
  return await transliterateGoogle(text);
}

/* ------------------------------------------------------------------ */
/* Small UI atoms                                                      */
/* ------------------------------------------------------------------ */

function Pill({ tone = "neutral", children }) {
  const tones = {
    neutral: { bg: "#EFE9DA", fg: "#5B5340" },
    good: { bg: "#DCEBDD", fg: "#2E5D37" },
    warn: { bg: "#F6E3C6", fg: "#8A5A15" },
    bad: { bg: "#F3DADC", fg: "#7A2530" },
    ink: { bg: "#DDE4F0", fg: "#28406E" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        background: t.bg,
        color: t.fg,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        letterSpacing: 0.2,
      }}
    >
      {children}
    </span>
  );
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6B5F45", marginBottom: 4, letterSpacing: 0.3, textTransform: "uppercase" }}>
        {label}
      </div>
      {children}
      {hint ? <div style={{ fontSize: 11, color: "#9B8F72", marginTop: 3 }}>{hint}</div> : null}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  border: "1px solid #D8CFBA",
  borderRadius: 8,
  background: "#FFFDF8",
  fontSize: 14.5,
  color: "#2B2620",
  fontFamily: "inherit",
};

function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function Select(props) {
  return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

function Button({ tone = "primary", children, style, ...rest }) {
  const tones = {
    primary: { bg: "#2F4B7C", fg: "#fff", border: "#2F4B7C" },
    ghost: { bg: "transparent", fg: "#2F4B7C", border: "#2F4B7C" },
    danger: { bg: "#8B2E3C", fg: "#fff", border: "#8B2E3C" },
    soft: { bg: "#EFE9DA", fg: "#4A4330", border: "#EFE9DA" },
  };
  const t = tones[tone] || tones.primary;
  return (
    <button
      {...rest}
      style={{
        background: t.bg,
        color: t.fg,
        border: "1px solid " + t.border,
        borderRadius: 8,
        padding: "8px 14px",
        fontSize: 13.5,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#FFFDF8",
        border: "1px solid #E4DCC6",
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 1px 2px rgba(60,50,20,0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(30,25,15,0.45)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FBF7EE",
          width: "100%",
          maxWidth: wide ? 640 : 460,
          maxHeight: "92vh",
          overflowY: "auto",
          borderRadius: "16px 16px 0 0",
          padding: 20,
          borderTop: "3px solid #2F4B7C",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 19, color: "#2B2620" }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, color: "#8A7F63", cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main App                                                             */
/* ------------------------------------------------------------------ */

export default function App() {
  const [data, setData] = useState(emptyData());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("dashboard");

  const [editing, setEditing] = useState(null); // student being edited, or "new"
  const [progressingId, setProgressingId] = useState(null);
  const [droppingId, setDroppingId] = useState(null);
  const [newAccount, setNewAccount] = useState({ name: "", capacity: "" });

  const [filters, setFilters] = useState({ q: "", accountId: "", level: "", status: "active", pay: "", books: "" });

  /* ---- load: sign in anonymously, then listen live to the shared doc ---- */
  const docRef = doc(db, "register", "data");

  useEffect(() => {
    let unsubSnapshot = () => {};

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch((e) => {
          setLoadError("Could not sign in: " + (e && e.message ? e.message : String(e)));
          setLoading(false);
        });
        return;
      }
      unsubSnapshot = onSnapshot(
        docRef,
        (snap) => {
          const parsed = snap.exists() ? snap.data() : {};
          setData({ accounts: parsed.accounts || [], students: parsed.students || [], exams: parsed.exams || {} });
          setLoading(false);
          setLoadError("");
        },
        (e) => {
          setLoadError("Could not load data: " + (e && e.message ? e.message : String(e)));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      unsubSnapshot();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    setSaving(true);
    try {
      await setDoc(docRef, next);
      setLoadError("");
    } catch (e) {
      setLoadError("Could not save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- derived ---- */
  const accountsById = useMemo(() => {
    const m = {};
    data.accounts.forEach((a) => (m[a.id] = a));
    return m;
  }, [data.accounts]);

  const activeStudents = useMemo(() => data.students.filter((s) => s.status === "active"), [data.students]);

  const accountLoad = useMemo(() => {
    const counts = {};
    activeStudents.forEach((s) => {
      counts[s.accountId] = (counts[s.accountId] || 0) + 1;
    });
    return counts;
  }, [activeStudents]);

  const unpaid = useMemo(() => activeStudents.filter((s) => !s.feesPaid), [activeStudents]);
  const noBooks = useMemo(() => activeStudents.filter((s) => !s.booksGiven), [activeStudents]);
  const missing = useMemo(() => activeStudents.filter(isMissingDetails), [activeStudents]);
  const dropped = useMemo(() => data.students.filter((s) => s.status === "dropped"), [data.students]);
  const completed = useMemo(() => data.students.filter((s) => s.status === "completed"), [data.students]);

  const upcomingExams = useMemo(() => {
    const today = todayISO();
    return LEVELS.map((lv) => ({ level: lv, date: data.exams[lv] || "" }))
      .filter((e) => e.date && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data.exams]);

  /* ---- account actions ---- */
  function addAccount() {
    if (!newAccount.name.trim()) return;
    const acc = { id: uid(), name: newAccount.name.trim(), capacity: Number(newAccount.capacity) || 0 };
    persist({ ...data, accounts: [...data.accounts, acc] });
    setNewAccount({ name: "", capacity: "" });
  }
  function updateAccount(id, patch) {
    persist({ ...data, accounts: data.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }
  function removeAccount(id) {
    if (accountLoad[id]) {
      alert("This account still has active students on it. Move them to another account first.");
      return;
    }
    if (!confirm("Remove this account?")) return;
    persist({ ...data, accounts: data.accounts.filter((a) => a.id !== id) });
  }

  /* ---- student actions ---- */
  function saveStudent(student) {
    const exists = data.students.some((s) => s.id === student.id);
    const next = exists
      ? data.students.map((s) => (s.id === student.id ? student : s))
      : [...data.students, { ...student, id: uid() }];
    persist({ ...data, students: next });
    setEditing(null);
  }

  function moveAccount(id, accountId) {
    persist({ ...data, students: data.students.map((s) => (s.id === id ? { ...s, accountId } : s)) });
  }

  function doProgress(student, { newRoll, marksheet, keepStatusCompleted }) {
    const historyEntry = {
      level: student.level,
      rollNumber: student.rollNumber,
      examDate: data.exams[student.level] || "",
      feesPaid: student.feesPaid,
      booksGiven: student.booksGiven,
      marksheetReceived: marksheet,
      completedOn: todayISO(),
    };
    const nextLevel = student.level + 1;
    const updated = {
      ...student,
      history: [...student.history, historyEntry],
      level: keepStatusCompleted ? student.level : nextLevel,
      rollNumber: newRoll ? newRoll : student.rollNumber,
      feesPaid: false,
      booksGiven: false,
      status: keepStatusCompleted ? "completed" : "active",
    };
    persist({ ...data, students: data.students.map((s) => (s.id === student.id ? updated : s)) });
    setProgressingId(null);
  }

  function doDrop(id, note) {
    persist({
      ...data,
      students: data.students.map((s) => (s.id === id ? { ...s, status: "dropped", dropNote: note } : s)),
    });
    setDroppingId(null);
  }

  function reactivate(id) {
    persist({ ...data, students: data.students.map((s) => (s.id === id ? { ...s, status: "active" } : s)) });
  }

  /* ---- filtered list for Students tab ---- */
  const filteredStudents = useMemo(() => {
    return data.students.filter((s) => {
      if (filters.status && s.status !== filters.status) return false;
      if (filters.accountId && s.accountId !== filters.accountId) return false;
      if (filters.level && String(s.level) !== String(filters.level)) return false;
      if (filters.pay === "unpaid" && s.feesPaid) return false;
      if (filters.pay === "paid" && !s.feesPaid) return false;
      if (filters.books === "no" && s.booksGiven) return false;
      if (filters.books === "yes" && !s.booksGiven) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const hay = [s.nameEn, s.nameHi, s.fatherEn, s.fatherHi, s.rollNumber, s.aadhar].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.students, filters]);

  /* ---- render ---- */
  if (loading) {
    return (
      <Wrap>
        <div style={{ padding: 40, textAlign: "center", color: "#6B5F45" }}>
          Opening the register…
          {loadError ? (
            <div style={{ marginTop: 16, color: "#8B2E3C", fontSize: 13, whiteSpace: "pre-wrap" }}>{loadError}</div>
          ) : null}
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <Header saving={saving} error={loadError} />

      <Tabs
        tab={tab}
        setTab={setTab}
        counts={{ students: activeStudents.length, accounts: data.accounts.length, dropped: dropped.length }}
      />

      <div style={{ padding: "14px 14px 60px" }}>
        {tab === "dashboard" && (
          <Dashboard
            data={data}
            accountsById={accountsById}
            accountLoad={accountLoad}
            unpaid={unpaid}
            noBooks={noBooks}
            missing={missing}
            dropped={dropped}
            completed={completed}
            upcomingExams={upcomingExams}
            goto={(t, f) => {
              if (f) setFilters((prev) => ({ ...prev, ...f }));
              setTab(t);
            }}
          />
        )}

        {tab === "students" && (
          <StudentsTab
            students={filteredStudents}
            accounts={data.accounts}
            accountsById={accountsById}
            filters={filters}
            setFilters={setFilters}
            onEdit={(s) => setEditing(s)}
            onAddNew={() => setEditing("new")}
            onMove={moveAccount}
            onProgress={(id) => setProgressingId(id)}
            onDrop={(id) => setDroppingId(id)}
            onReactivate={reactivate}
          />
        )}

        {tab === "accounts" && (
          <AccountsTab
            accounts={data.accounts}
            accountLoad={accountLoad}
            newAccount={newAccount}
            setNewAccount={setNewAccount}
            addAccount={addAccount}
            updateAccount={updateAccount}
            removeAccount={removeAccount}
          />
        )}

        {tab === "exams" && (
          <ExamsTab exams={data.exams} setExams={(exams) => persist({ ...data, exams })} />
        )}
      </div>

      {editing !== null && (
        <StudentModal
          initial={editing === "new" ? blankStudent() : editing}
          accounts={data.accounts}
          onClose={() => setEditing(null)}
          onSave={saveStudent}
        />
      )}

      {progressingId && (
        <ProgressModal
          student={data.students.find((s) => s.id === progressingId)}
          onClose={() => setProgressingId(null)}
          onConfirm={doProgress}
        />
      )}

      {droppingId && (
        <DropModal
          student={data.students.find((s) => s.id === droppingId)}
          onClose={() => setDroppingId(null)}
          onConfirm={(note) => doDrop(droppingId, note)}
        />
      )}
    </Wrap>
  );
}

/* ------------------------------------------------------------------ */
/* Layout pieces                                                       */
/* ------------------------------------------------------------------ */

function Wrap({ children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F6F1E7",
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        color: "#2B2620",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        ::placeholder { color: #B7AC90; }
        .ledger-rule { border-bottom: 1px solid #E4DCC6; }
        button:active { transform: translateY(1px); }
        .scrollx { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      `}</style>
      <div style={{ maxWidth: 780, margin: "0 auto", position: "relative" }}>{children}</div>
    </div>
  );
}

function Header({ saving, error }) {
  return (
    <div
      style={{
        padding: "18px 16px 12px",
        borderLeft: "4px solid #8B2E3C",
        margin: "0 14px",
        marginTop: 14,
        background: "#FFFDF8",
        borderRadius: "2px 10px 10px 2px",
        border: "1px solid #E4DCC6",
        borderLeftWidth: 4,
        borderLeftColor: "#8B2E3C",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: 22, letterSpacing: 0.2 }}>
          The Register
        </h1>
        <span style={{ fontSize: 11, color: saving ? "#B4791F" : "#9B8F72" }}>
          {saving ? "saving…" : "saved"}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: "#8A7F63", marginTop: 2 }}>Exam levels, roll numbers &amp; students</div>
      {error ? <div style={{ fontSize: 12, color: "#8B2E3C", marginTop: 6 }}>{error}</div> : null}
    </div>
  );
}

function Tabs({ tab, setTab, counts }) {
  const items = [
    { id: "dashboard", label: "Dashboard" },
    { id: "students", label: "Students (" + counts.students + ")" },
    { id: "accounts", label: "Accounts" },
    { id: "exams", label: "Exam dates" },
  ];
  return (
    <div className="scrollx" style={{ display: "flex", gap: 8, padding: "14px 14px 0", whiteSpace: "nowrap" }}>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid " + (tab === it.id ? "#2F4B7C" : "#E4DCC6"),
            background: tab === it.id ? "#2F4B7C" : "#FFFDF8",
            color: tab === it.id ? "#fff" : "#4A4330",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

function Dashboard({ data, accountsById, accountLoad, unpaid, noBooks, missing, dropped, completed, upcomingExams, goto }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <StatCard label="Active students" value={data.students.filter((s) => s.status === "active").length} tone="ink" onClick={() => goto("students", { status: "active" })} />
        <StatCard label="Completed all levels" value={completed.length} tone="good" onClick={() => goto("students", { status: "completed" })} />
        <StatCard label="Fees pending" value={unpaid.length} tone="warn" onClick={() => goto("students", { status: "active", pay: "unpaid" })} />
        <StatCard label="Books not given" value={noBooks.length} tone="warn" onClick={() => goto("students", { status: "active", books: "no" })} />
        <StatCard label="Missing details" value={missing.length} tone="bad" onClick={() => goto("students", { status: "active" })} />
        <StatCard label="Dropped" value={dropped.length} tone="bad" onClick={() => goto("students", { status: "dropped" })} />
      </div>

      <Card>
        <SectionTitle>Accounts &amp; capacity</SectionTitle>
        {data.accounts.length === 0 && <Empty>No accounts yet — add one in the Accounts tab.</Empty>}
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {data.accounts.map((a) => {
            const count = accountLoad[a.id] || 0;
            const full = a.capacity > 0 && count >= a.capacity;
            const pct = a.capacity > 0 ? Math.min(100, (count / a.capacity) * 100) : 0;
            return (
              <div key={a.id}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>{a.name}</span>
                  <span style={{ color: full ? "#8B2E3C" : "#6B5F45" }}>
                    {count}
                    {a.capacity ? " / " + a.capacity : ""}
                    {full ? " · full" : ""}
                  </span>
                </div>
                {a.capacity > 0 && (
                  <div style={{ height: 6, background: "#EFE9DA", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: full ? "#8B2E3C" : "#2F4B7C" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle>Upcoming exam dates</SectionTitle>
        {upcomingExams.length === 0 && <Empty>No upcoming dates set — add them in the Exam dates tab.</Empty>}
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {upcomingExams.map((e) => (
            <div key={e.level} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
              <span>Level {e.level}</span>
              <span style={{ fontWeight: 600 }}>{e.date}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone, onClick }) {
  const tones = {
    ink: "#2F4B7C",
    good: "#2E5D37",
    warn: "#8A5A15",
    bad: "#7A2530",
  };
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        background: "#FFFDF8",
        border: "1px solid #E4DCC6",
        borderRadius: 12,
        padding: "12px 14px",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 800, color: tones[tone] || "#2B2620", fontFamily: "Georgia, serif" }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6B5F45", marginTop: 2 }}>{label}</div>
    </button>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 13, fontWeight: 800, color: "#4A4330", textTransform: "uppercase", letterSpacing: 0.4 }}>{children}</div>;
}
function Empty({ children }) {
  return <div style={{ fontSize: 13, color: "#9B8F72", padding: "10px 0" }}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Students tab                                                        */
/* ------------------------------------------------------------------ */

function StudentsTab({ students, accounts, accountsById, filters, setFilters, onEdit, onAddNew, onMove, onProgress, onDrop, onReactivate }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <SectionTitle>Students</SectionTitle>
        <Button onClick={onAddNew}>+ Add student</Button>
      </div>

      <Card style={{ padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <TextInput
            placeholder="Search name, roll no, Aadhar…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="dropped">Dropped</option>
              <option value="completed">Completed</option>
            </Select>
            <Select value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}>
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
            <Select value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })}>
              <option value="">All levels</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>Level {l}</option>
              ))}
            </Select>
            <Select value={filters.pay} onChange={(e) => setFilters({ ...filters, pay: e.target.value })}>
              <option value="">Paid + unpaid</option>
              <option value="paid">Fees paid</option>
              <option value="unpaid">Fees pending</option>
            </Select>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gap: 8 }}>
        {students.length === 0 && <Empty>No students match this filter.</Empty>}
        {students.map((s) => (
          <StudentRow
            key={s.id}
            s={s}
            accounts={accounts}
            accountName={accountsById[s.accountId] ? accountsById[s.accountId].name : "— none —"}
            onEdit={() => onEdit(s)}
            onMove={(accId) => onMove(s.id, accId)}
            onProgress={() => onProgress(s.id)}
            onDrop={() => onDrop(s.id)}
            onReactivate={() => onReactivate(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

function StudentRow({ s, accounts, accountName, onEdit, onMove, onProgress, onDrop, onReactivate }) {
  const missing = isMissingDetails(s);
  return (
    <Card style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div onClick={onEdit} style={{ cursor: "pointer", flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {s.nameEn || "(no name)"} {s.nameHi ? <span style={{ color: "#6B5F45", fontWeight: 400 }}>· {s.nameHi}</span> : null}
          </div>
          <div style={{ fontSize: 12.5, color: "#6B5F45", marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
            Roll {s.rollNumber || "—"} · Level {s.level}
          </div>
          <div style={{ fontSize: 12, color: "#8A7F63", marginTop: 2 }}>{accountName}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <Pill tone={s.status === "dropped" ? "bad" : s.status === "completed" ? "good" : "neutral"}>
            {s.status === "dropped" ? "Dropped" : s.status === "completed" ? "Completed" : "Active"}
          </Pill>
          <Pill tone={s.feesPaid ? "good" : "warn"}>{s.feesPaid ? "Paid" : "Fees due"}</Pill>
          <Pill tone={s.booksGiven ? "good" : "warn"}>{s.booksGiven ? "Books given" : "No books"}</Pill>
          {missing ? <Pill tone="bad">Missing info</Pill> : null}
        </div>
      </div>

      {s.status === "active" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          <Button tone="soft" onClick={onEdit}>Edit</Button>
          <Button tone="soft" onClick={onProgress}>{s.level >= 7 ? "Mark complete" : "Next level →"}</Button>
          <Select
            value={s.accountId}
            onChange={(e) => onMove(e.target.value)}
            style={{ width: "auto", padding: "8px 10px", fontSize: 12.5 }}
          >
            <option value="">Move to account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Button tone="danger" onClick={onDrop}>Mark dropped</Button>
        </div>
      )}
      {s.status === "dropped" && (
        <div style={{ marginTop: 10 }}>
          {s.dropNote ? <div style={{ fontSize: 12.5, color: "#7A2530", marginBottom: 6 }}>Note: {s.dropNote}</div> : null}
          <div style={{ display: "flex", gap: 6 }}>
            <Button tone="soft" onClick={onEdit}>Edit</Button>
            <Button tone="ghost" onClick={onReactivate}>Reactivate</Button>
          </div>
        </div>
      )}
      {s.status === "completed" && (
        <div style={{ marginTop: 10 }}>
          <Button tone="soft" onClick={onEdit}>View history</Button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Student add/edit modal                                              */
/* ------------------------------------------------------------------ */

function StudentModal({ initial, accounts, onClose, onSave }) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState({ name: false, father: false });
  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));

  async function translate(field, sourceField) {
    setBusy((b) => ({ ...b, [field]: true }));
    try {
      const hi = await transliterateToHindi(s[sourceField]);
      set({ [field]: hi });
    } catch (e) {
      console.error("Transliteration failed:", e);
      alert("Translation failed.\n\nTechnical detail (please screenshot this for support):\n" + (e && e.message ? e.message : String(e)));
    } finally {
      setBusy((b) => ({ ...b, [field]: false }));
    }
  }

  return (
    <Modal title={initial.id ? "Edit student" : "Add student"} onClose={onClose} wide>
      <Field label="Roll number">
        <TextInput value={s.rollNumber} onChange={(e) => set({ rollNumber: e.target.value })} placeholder="Given by institute" />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Level">
          <Select value={s.level} onChange={(e) => set({ level: Number(e.target.value) })}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>Level {l}</option>
            ))}
          </Select>
        </Field>
        <Field label="Account (who she's under)">
          <Select value={s.accountId} onChange={(e) => set({ accountId: e.target.value })}>
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Student name (English)">
        <TextInput value={s.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />
      </Field>
      <Field
        label="Student name (Hindi)"
        hint={busy.name ? "Translating…" : "Type the English name above, then translate."}
      >
        <div style={{ display: "flex", gap: 6 }}>
          <TextInput value={s.nameHi} onChange={(e) => set({ nameHi: e.target.value })} />
          <Button tone="soft" type="button" onClick={() => translate("nameHi", "nameEn")} disabled={busy.name}>अ</Button>
        </div>
      </Field>

      <Field label="Father's name (English)">
        <TextInput value={s.fatherEn} onChange={(e) => set({ fatherEn: e.target.value })} />
      </Field>
      <Field label="Father's name (Hindi)" hint={busy.father ? "Translating…" : undefined}>
        <div style={{ display: "flex", gap: 6 }}>
          <TextInput value={s.fatherHi} onChange={(e) => set({ fatherHi: e.target.value })} />
          <Button tone="soft" type="button" onClick={() => translate("fatherHi", "fatherEn")} disabled={busy.father}>अ</Button>
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Date of birth">
          <TextInput type="date" value={s.dob} onChange={(e) => set({ dob: e.target.value })} />
        </Field>
        <Field label="Aadhar number">
          <TextInput value={s.aadhar} onChange={(e) => set({ aadhar: e.target.value })} placeholder="12-digit number" />
        </Field>
      </div>

      <div style={{ display: "flex", gap: 18, margin: "6px 0 16px" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
          <input type="checkbox" checked={s.feesPaid} onChange={(e) => set({ feesPaid: e.target.checked })} />
          Exam fees paid
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
          <input type="checkbox" checked={s.booksGiven} onChange={(e) => set({ booksGiven: e.target.checked })} />
          Study material given
        </label>
      </div>

      {s.history && s.history.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionTitle>Level history</SectionTitle>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {s.history.map((h, i) => (
              <div key={i} className="ledger-rule" style={{ fontSize: 12.5, color: "#6B5F45", paddingBottom: 6 }}>
                Level {h.level} · Roll {h.rollNumber || "—"} · {h.examDate || "no date"} ·{" "}
                {h.marksheetReceived ? "marksheet received" : "marksheet pending"}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button tone="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(s)}>Save</Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Progress-to-next-level modal                                        */
/* ------------------------------------------------------------------ */

function ProgressModal({ student, onClose, onConfirm }) {
  const [marksheet, setMarksheet] = useState(true);
  const [issueNewRoll, setIssueNewRoll] = useState(false);
  const [newRoll, setNewRoll] = useState("");
  if (!student) return null;
  const isLast = student.level >= 7;

  return (
    <Modal title={isLast ? "Mark level 7 complete" : "Move to next level"} onClose={onClose}>
      <div style={{ fontSize: 13.5, color: "#4A4330", marginBottom: 14 }}>
        {student.nameEn} is currently on Level {student.level} (Roll {student.rollNumber || "—"}).
      </div>

      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5, marginBottom: 12 }}>
        <input type="checkbox" checked={marksheet} onChange={(e) => setMarksheet(e.target.checked)} />
        Marksheet received for this level
      </label>

      {!isLast && (
        <>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5, marginBottom: 8 }}>
            <input type="checkbox" checked={issueNewRoll} onChange={(e) => setIssueNewRoll(e.target.checked)} />
            Institute issued a new roll number for the next level
          </label>
          {issueNewRoll && (
            <Field label="New roll number">
              <TextInput value={newRoll} onChange={(e) => setNewRoll(e.target.value)} />
            </Field>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <Button tone="ghost" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() =>
            onConfirm(student, {
              newRoll: issueNewRoll ? newRoll : "",
              marksheet,
              keepStatusCompleted: isLast,
            })
          }
        >
          Confirm
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Drop modal                                                          */
/* ------------------------------------------------------------------ */

function DropModal({ student, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  if (!student) return null;
  return (
    <Modal title="Mark as dropped" onClose={onClose}>
      <div style={{ fontSize: 13.5, color: "#4A4330", marginBottom: 12 }}>
        Marking {student.nameEn} as dropped. She can still call them from the dropped list — add a note if you like.
      </div>
      <Field label="Note (optional)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. said she'd rejoin next term" />
      </Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
        <Button tone="ghost" onClick={onClose}>Cancel</Button>
        <Button tone="danger" onClick={() => onConfirm(note)}>Mark dropped</Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Accounts tab                                                        */
/* ------------------------------------------------------------------ */

function AccountsTab({ accounts, accountLoad, newAccount, setNewAccount, addAccount, updateAccount, removeAccount }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <SectionTitle>Accounts</SectionTitle>
      <Card>
        <div style={{ fontSize: 12.5, color: "#8A7F63", marginBottom: 10 }}>
          Each account is a person who takes on a share of the students (and a share of the fee money). Set a capacity so you know when one is full.
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {accounts.map((a) => (
            <div key={a.id} className="ledger-rule" style={{ display: "flex", gap: 8, alignItems: "center", paddingBottom: 10 }}>
              <TextInput value={a.name} onChange={(e) => updateAccount(a.id, { name: e.target.value })} style={{ flex: 2 }} />
              <TextInput
                type="number"
                value={a.capacity}
                onChange={(e) => updateAccount(a.id, { capacity: Number(e.target.value) })}
                style={{ flex: 1 }}
                placeholder="Capacity"
              />
              <span style={{ fontSize: 12, color: "#6B5F45", minWidth: 40 }}>{accountLoad[a.id] || 0} now</span>
              <Button tone="ghost" onClick={() => removeAccount(a.id)}>✕</Button>
            </div>
          ))}
          {accounts.length === 0 && <Empty>No accounts yet.</Empty>}
        </div>
      </Card>

      <Card>
        <SectionTitle>Add account</SectionTitle>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <TextInput
            placeholder="Person's name"
            value={newAccount.name}
            onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
            style={{ flex: 2 }}
          />
          <TextInput
            type="number"
            placeholder="Capacity"
            value={newAccount.capacity}
            onChange={(e) => setNewAccount({ ...newAccount, capacity: e.target.value })}
            style={{ flex: 1 }}
          />
          <Button onClick={addAccount}>Add</Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Exam dates tab                                                      */
/* ------------------------------------------------------------------ */

function ExamsTab({ exams, setExams }) {
  const [local, setLocal] = useState(exams);
  useEffect(() => setLocal(exams), [exams]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <SectionTitle>Exam dates by level</SectionTitle>
      <Card>
        <div style={{ display: "grid", gap: 10 }}>
          {LEVELS.map((lv) => (
            <div key={lv} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 70, fontSize: 13.5, fontWeight: 600 }}>Level {lv}</div>
              <TextInput
                type="date"
                value={local[lv] || ""}
                onChange={(e) => setLocal({ ...local, [lv]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, textAlign: "right" }}>
          <Button onClick={() => setExams(local)}>Save dates</Button>
        </div>
      </Card>
    </div>
  );
}

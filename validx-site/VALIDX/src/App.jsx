import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════
const haptic = (pattern = 10) => {
  if (navigator.vibrate) navigator.vibrate(pattern);
};

const LS = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || window.VALIDX_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || window.VALIDX_SUPABASE_ANON_KEY || '';
let supabaseClientPromise = null;

async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase is not configured');
    supabaseClientPromise = Promise.resolve(createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  }
  return supabaseClientPromise;
}

function normalizeRole(role, fallback = 'tester') {
  return ['business', 'tester', 'admin'].includes(role) ? role : fallback;
}

function dateOnly(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function splitNameFromSession(user) {
  const metadata = user?.user_metadata || {};
  const first = metadata.firstName || metadata.first_name;
  const last = metadata.lastName || metadata.last_name;
  if (first || last) return { firstName: first || 'New', lastName: last || 'User' };

  const fullName = metadata.full_name || metadata.name || user?.email || 'New User';
  const [firstName, ...rest] = String(fullName).trim().split(/\s+/);
  return { firstName: firstName || 'New', lastName: rest.join(' ') || 'User' };
}

function profileFromDb(row, fallbackRole) {
  const role = normalizeRole(row?.role, fallbackRole || 'tester');
  return {
    id: row.id,
    supabaseId: row.id,
    role,
    firstName: row.first_name || 'New',
    lastName: row.last_name || 'User',
    email: row.email,
    company: row.company || '',
    industry: row.industry || 'SaaS',
    companySize: row.company_size || '1-10',
    school: row.school || '',
    major: row.major || '',
    age: row.age ? String(row.age) : '',
    status: row.status || 'active',
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    authMethod: row.auth_method || 'supabase',
  };
}

function profileInsertFromSession(session, fallbackRole, profileData = {}) {
  const user = session?.user;
  const metadata = user?.user_metadata || {};
  const { firstName, lastName } = splitNameFromSession(user);
  const role = normalizeRole(profileData.role || metadata.role, normalizeRole(fallbackRole, 'tester'));

  return {
    id: user.id,
    role: role === 'admin' ? 'tester' : role,
    email: profileData.email || user.email,
    auth_method: 'supabase',
    first_name: profileData.firstName || metadata.firstName || metadata.first_name || firstName,
    last_name: profileData.lastName || metadata.lastName || metadata.last_name || lastName,
    company: profileData.company || metadata.company || null,
    industry: profileData.industry || metadata.industry || null,
    company_size: profileData.companySize || metadata.companySize || metadata.company_size || null,
    school: profileData.school || metadata.school || null,
    major: profileData.major || metadata.major || null,
    age: profileData.age || metadata.age ? Number(profileData.age || metadata.age) : null,
    status: 'active',
  };
}

async function syncSupabaseProfile(session, fallbackRole, profileData = {}) {
  if (!session?.access_token || !session?.user) throw new Error('Missing Supabase session');
  localStorage.setItem('vx_supabase_token', session.access_token);

  const supabase = await getSupabaseClient();
  const { data: existing, error: selectError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return profileFromDb(existing, fallbackRole);

  const insertPayload = profileInsertFromSession(session, fallbackRole, profileData);
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) throw insertError;
  return profileFromDb(created, fallbackRole);
}

async function beginGoogleAuth(role) {
  const supabase = await getSupabaseClient();
  LS.set('vx_pending_role', role);
  const redirectTo = window.location.href.split('#')[0];
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}

function normalizeFiles(filesJson) {
  if (!filesJson) return [];
  if (Array.isArray(filesJson)) return filesJson;
  try {
    const parsed = JSON.parse(filesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatSubmission(row) {
  const testerProfile = row.profiles || {};
  const testerName = [testerProfile.first_name, testerProfile.last_name].filter(Boolean).join(' ') || 'Tester';
  return {
    id: row.id,
    testerId: row.tester_id,
    testerName,
    date: dateOnly(row.created_at),
    notes: row.notes || '',
    files: normalizeFiles(row.files_json),
    payout: row.payout || 0,
    status: row.status || 'submitted',
  };
}

function formatExperiment(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    assumption: row.assumption,
    type: row.type,
    tier: row.tier,
    budget: row.budget,
    reach: row.reach,
    status: row.status,
    paidWith: row.paid_with,
    paymentRef: row.payment_ref,
    createdAt: dateOnly(row.created_at),
    createdBy: row.owner_id,
    submissions: (row.submissions || []).map(formatSubmission),
  };
}

async function fetchExperimentsForProfile(profile) {
  if (!profile) return [];
  const supabase = await getSupabaseClient();
  const submissionFields = 'id,tester_id,notes,files_json,payout,status,created_at,profiles!submissions_tester_id_fkey(first_name,last_name)';
  let query = supabase
    .from('experiments')
    .select(`id,owner_id,title,assumption,type,tier,budget,reach,status,paid_with,payment_ref,created_at,submissions(${submissionFields})`)
    .order('created_at', { ascending: false });

  if (profile.role === 'business') query = query.eq('owner_id', profile.id);
  if (profile.role === 'tester') query = query.eq('status', 'active');

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(formatExperiment);
}

async function fetchClaimedExperimentIds(profile) {
  if (!profile || profile.role !== 'tester') return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('experiment_claims')
    .select('experiment_id')
    .eq('tester_id', profile.id)
    .eq('status', 'claimed');

  if (error) throw error;
  return (data || []).map(row => row.experiment_id);
}

async function fetchTesterEarnings(profile) {
  if (!profile || profile.role !== 'tester') return { available: 0, history: [] };
  const supabase = await getSupabaseClient();
  const [submissionsRes, payoutsRes] = await Promise.all([
    supabase
      .from('submissions')
      .select('id,payout,status,created_at,experiments(title)')
      .eq('tester_id', profile.id)
      .neq('status', 'rejected'),
    supabase
      .from('payouts')
      .select('id,amount,method,status,created_at,paid_at')
      .eq('tester_id', profile.id),
  ]);

  if (submissionsRes.error) throw submissionsRes.error;
  if (payoutsRes.error) throw payoutsRes.error;

  const submissions = submissionsRes.data || [];
  const payouts = payoutsRes.data || [];
  const earned = submissions.reduce((sum, row) => sum + Number(row.payout || 0), 0);
  const reserved = payouts
    .filter(row => ['pending', 'processing', 'paid'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const earnedTxns = submissions.map(row => ({
    id: `submission-${row.id}`,
    desc: row.experiments?.title || 'Experiment',
    amount: Number(row.payout || 0),
    type: 'earned',
    date: dateOnly(row.created_at),
    sortAt: row.created_at,
  }));

  const payoutTxns = payouts.map(row => ({
    id: `payout-${row.id}`,
    desc: `${row.status[0].toUpperCase()}${row.status.slice(1)} withdrawal via ${row.method}`,
    amount: Number(row.amount || 0),
    type: 'withdrawn',
    date: dateOnly(row.created_at),
    sortAt: row.created_at,
  }));

  return {
    available: Math.max(0, earned - reserved),
    history: [...earnedTxns, ...payoutTxns].sort((a, b) => new Date(a.sortAt) - new Date(b.sortAt)),
  };
}

async function createSupabaseExperiment(profile, exp) {
  const info = TIER_INFO[exp.tier];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('experiments')
    .insert({
      owner_id: profile.id,
      title: exp.title,
      assumption: exp.assumption,
      type: exp.type,
      tier: exp.tier,
      budget: exp.budget || info.price,
      reach: info.reach,
      status: 'active',
      paid_with: exp.paidWith || null,
      payment_ref: exp.paymentRef || null,
    })
    .select('id,owner_id,title,assumption,type,tier,budget,reach,status,paid_with,payment_ref,created_at,submissions(*)')
    .single();

  if (error) throw error;
  return formatExperiment(data);
}

async function claimSupabaseExperiment(profile, experimentId) {
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('experiment_claims')
    .insert({ experiment_id: experimentId, tester_id: profile.id, status: 'claimed' });

  if (error && error.code !== '23505') throw error;
}

async function submitSupabaseExperiment(profile, exp, notes, files) {
  const supabase = await getSupabaseClient();
  const fileNames = files.map(file => file.name);
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      experiment_id: exp.id,
      tester_id: profile.id,
      notes: notes.trim(),
      files_json: fileNames,
    })
    .select('id,payout,status')
    .single();

  if (error) throw error;

  await supabase
    .from('experiment_claims')
    .delete()
    .eq('experiment_id', exp.id)
    .eq('tester_id', profile.id);

  return data;
}

async function requestSupabaseCashout(profile, amount, method) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('payouts')
    .insert({
      tester_id: profile.id,
      amount: Math.floor(Number(amount)),
      method,
      status: 'pending',
    })
    .select('id,amount,status')
    .single();

  if (error) throw error;
  return data;
}

// ═══════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════
const SEED_EXPERIMENTS = [
  {
    id: 1, title: "Pricing for FitMeal Kits", status: "active",
    assumption: "College students will pay $12/meal for healthy, pre-portioned meal kits delivered to campus.",
    type: "pricing", budget: 89, tier: "deep-dive",
    createdAt: "2026-04-07", createdBy: "business",
    submissions: [
      { id: 101, testerName: "Alex R.", date: "2026-04-08", notes: "Surveyed 22 students in the dining hall. 14 said they'd pay $10 but only 6 would pay $12. Most said $8-10 feels right for a meal kit. Biggest concern was freshness and delivery timing.", files: ["survey_responses.csv", "photo_setup.jpg"] },
      { id: 102, testerName: "Maya K.", date: "2026-04-09", notes: "Ran a quick landing page test on Instagram stories. 340 views, 47 clicks, 8 signups at $12 price point. That's a 2.4% conversion. Better than expected but below the 5% benchmark.", files: ["ig_analytics.png", "landing_page_screenshot.png"] },
    ]
  },
  {
    id: 2, title: "LoopNote App — Feature Priority", status: "active",
    assumption: "Students prefer voice-memo note-taking over typed notes for study groups.",
    type: "feature", budget: 250, tier: "full-study",
    createdAt: "2026-04-05", createdBy: "business",
    submissions: [
      { id: 201, testerName: "Jordan T.", date: "2026-04-07", notes: "Conducted 3 focus groups (8 students each). Voice memos were popular for brainstorming but students strongly preferred typing for actual studying. Hybrid approach got the best reaction.", files: ["focus_group_notes.pdf", "audio_clips.zip"] },
    ]
  },
  {
    id: 3, title: "EcoSwap — Brand Positioning", status: "active",
    assumption: "Sustainability messaging drives more signups than savings messaging for a thrift marketplace app.",
    type: "brand", budget: 89, tier: "deep-dive",
    createdAt: "2026-04-08", createdBy: "business",
    submissions: []
  },
  {
    id: 4, title: "QuickShift — Channel Strategy", status: "completed",
    assumption: "TikTok is the most effective acquisition channel for a gig-economy tutoring platform.",
    type: "channel", budget: 250, tier: "full-study",
    createdAt: "2026-03-28", createdBy: "business",
    submissions: [
      { id: 401, testerName: "Sam L.", date: "2026-04-01", notes: "Posted 5 TikTok videos over 3 days. Best performing got 12K views and 89 link clicks. Instagram Reels got 4K views and 23 clicks. Reddit post in r/college got 156 clicks with 0 spend.", files: ["tiktok_analytics.csv", "comparison_chart.png"] },
      { id: 402, testerName: "Priya N.", date: "2026-04-02", notes: "Ran micro ad campaigns: $20 on TikTok (312 clicks), $20 on Instagram (178 clicks), $20 on Snapchat (94 clicks). TikTok CPM was lowest at $2.40. Clear winner.", files: ["ad_spend_report.xlsx"] },
    ]
  },
];

const TIER_INFO = {
  "quick-test": { name: "Quick Test", price: 29, reach: 10 },
  "deep-dive": { name: "Deep Dive", price: 89, reach: 25 },
  "full-study": { name: "Full Study", price: 250, reach: 50 },
};

// ═══════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════
function App() {
  const [splash, setSplash] = useState(true);
  const [onboarded, setOnboarded] = useState(() => LS.get('vx_onboarded', false));
  const [role, setRole] = useState(() => LS.get('vx_role', null));
  const [profile, setProfile] = useState(() => LS.get('vx_profile', null));
  const [authMode, setAuthMode] = useState(null); // null | 'login' | 'register'
  const [experiments, setExperiments] = useState(() => LS.get('vx_experiments', SEED_EXPERIMENTS));
  const [testerEarnings, setTesterEarnings] = useState(() => LS.get('vx_earnings', 47.50));
  const [testerTxns, setTesterTxns] = useState(() => LS.get('vx_txns', [
    { id: 1, desc: "QuickShift — Channel Strategy", amount: 25, type: "earned", date: "2026-04-01" },
    { id: 2, desc: "FitMeal Kits — Pricing", amount: 22.50, type: "earned", date: "2026-04-08" },
  ]));
  const [claimedIds, setClaimedIds] = useState(() => LS.get('vx_claimed', [1]));
  const [toast, setToast] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  // Persist state
  useEffect(() => LS.set('vx_experiments', experiments), [experiments]);
  useEffect(() => LS.set('vx_earnings', testerEarnings), [testerEarnings]);
  useEffect(() => LS.set('vx_txns', testerTxns), [testerTxns]);
  useEffect(() => LS.set('vx_claimed', claimedIds), [claimedIds]);
  useEffect(() => { if (role) LS.set('vx_role', role); }, [role]);
  useEffect(() => { if (onboarded) LS.set('vx_onboarded', true); }, [onboarded]);
  useEffect(() => { LS.set('vx_profile', profile); }, [profile]);

  // Splash timing
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 900);
    return () => clearTimeout(t);
  }, []);

  // Install prompt detection
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!LS.get('vx_install_dismissed', false)) setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Toast helper
  const showToast = useCallback((message, type = 'success') => {
    haptic(type === 'success' ? 20 : [30, 50, 30]);
    setToast({ message, type });
    setTimeout(() => setToast(null), 2800);
  }, []);

  // Handle install
  const handleInstall = async () => {
    haptic();
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setShowInstall(false);
    setInstallPrompt(null);
  };
  const dismissInstall = () => {
    haptic();
    setShowInstall(false);
    LS.set('vx_install_dismissed', true);
  };

  const handleLogout = () => {
    haptic();
    getSupabaseClient().then(supabase => supabase.auth.signOut()).catch(() => {});
    setProfile(null);
    setRole(null);
    setAuthMode(null);
    localStorage.removeItem('vx_supabase_token');
    LS.set('vx_role', null);
    LS.set('vx_profile', null);
  };

  const handleAuthSuccess = (newProfile) => {
    haptic(30);
    if (newProfile.role) setRole(newProfile.role);
    setProfile(newProfile);
    setAuthMode(null);
    showToast(`Welcome${newProfile.firstName ? ', ' + newProfile.firstName : ''}!`);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !active) return;
        const fallbackRole = LS.get('vx_pending_role', role);
        if (fallbackRole && !session.user?.user_metadata?.role) {
          await supabase.auth.updateUser({
            data: { ...(session.user?.user_metadata || {}), role: fallbackRole },
          });
        }
        const synced = await syncSupabaseProfile(session, fallbackRole);
        if (!active) return;
        LS.set('vx_pending_role', null);
        setRole(synced.role);
        setProfile(synced);
        setAuthMode(null);
      } catch (e) {
        console.warn('Supabase session restore skipped:', e.message);
      }
    })();
    return () => { active = false; };
  }, []);

  if (splash) return <Splash />;
  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />;
  if (!role) return <RoleSelect onSelect={(r) => { haptic(); setRole(r); setAuthMode('register'); }} />;
  if (!profile) {
    return authMode === 'login'
      ? <LoginScreen role={role} onSuccess={handleAuthSuccess} onSwitchToRegister={() => { haptic(); setAuthMode('register'); }} onBack={() => { haptic(); setRole(null); setAuthMode(null); }} />
      : <RegisterScreen role={role} onSuccess={handleAuthSuccess} onSwitchToLogin={() => { haptic(); setAuthMode('login'); }} onBack={() => { haptic(); setRole(null); setAuthMode(null); }} />;
  }

  return (
    <>
      {role === 'business' ? (
        <BusinessApp profile={profile} experiments={experiments} setExperiments={setExperiments} onLogout={handleLogout} showToast={showToast} />
      ) : (
        <TesterApp
          profile={profile}
          experiments={experiments} setExperiments={setExperiments}
          earnings={testerEarnings} setEarnings={setTesterEarnings}
          txns={testerTxns} setTxns={setTesterTxns}
          claimedIds={claimedIds} setClaimedIds={setClaimedIds}
          onLogout={handleLogout} showToast={showToast}
        />
      )}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
      {showInstall && (
        <div className="install-banner">
          <div className="icon">📱</div>
          <div className="text">
            <div className="title">Install ValidX</div>
            <div className="desc">Add to home screen for quick access</div>
          </div>
          <button onClick={handleInstall}>Install</button>
          <button className="close" onClick={dismissInstall}>×</button>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════
// SPLASH SCREEN
// ═══════════════════════════════════════════════════
function Splash() {
  return (
    <div className="splash">
      <div className="splash-logo">Valid<span>X</span></div>
      <div className="splash-tag">Test your riskiest assumptions</div>
      <div className="splash-spinner"></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════
function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const slides = [
    { emoji: "🎯", title: "Test Before You Build", desc: "Validate your riskiest business assumptions in days — not months. No more guessing." },
    { emoji: "🌐", title: "Real Market Data", desc: "Tap into a live network of college student testers who represent the next generation of consumers." },
    { emoji: "💰", title: "Pay Per Test", desc: "Starting at just $29. No subscriptions, no contracts. Get actionable insights fast." },
  ];
  const current = slides[step];
  const next = () => { haptic(); step === slides.length - 1 ? onDone() : setStep(step + 1); };

  return (
    <div className="onboarding">
      <button className="onboarding-skip" onClick={() => { haptic(); onDone(); }}>Skip</button>
      <div className="onboarding-content" key={step}>
        <div className="onboarding-emoji">{current.emoji}</div>
        <h1>{current.title}</h1>
        <p>{current.desc}</p>
      </div>
      <div className="onboarding-dots">
        {slides.map((_, i) => <div key={i} className={`dot ${i === step ? 'active' : ''}`}></div>)}
      </div>
      <button className="btn btn-primary btn-lg btn-block" onClick={next}>
        {step === slides.length - 1 ? "Get Started" : "Next"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// ROLE SELECT
// ═══════════════════════════════════════════════════
function RoleSelect({ onSelect }) {
  return (
    <div className="app">
      <div className="role-select page">
        <div className="role-select-logo">Valid<span>X</span></div>
        <p className="sub">Choose how you want to use ValidX</p>
        <div className="role-cards">
          <div className="role-card" onClick={() => onSelect('business')}>
            <div className="emoji">💼</div>
            <div className="content">
              <h2>I'm a Business</h2>
              <p>Create experiments and get real data from next-gen consumers</p>
            </div>
            <div className="arrow">›</div>
          </div>
          <div className="role-card" onClick={() => onSelect('tester')}>
            <div className="emoji">🎓</div>
            <div className="content">
              <h2>I'm a Tester</h2>
              <p>Browse experiments, provide feedback, and earn money</p>
            </div>
            <div className="arrow">›</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// GOOGLE BUTTON (shared)
// ═══════════════════════════════════════════════════
function GoogleButton({ label, onClick }) {
  return (
    <button type="button" className="google-btn" onClick={onClick}>
      <svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.9 35.6 44 30.2 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>
      {label}
    </button>
  );
}

function PasswordField({ value, onChange, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => { haptic(5); setVisible(v => !v); }}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

// Simulate Google OAuth (in production, this calls Google Identity Services)
function mockGoogleAuth(role) {
  const demoNames = role === 'business'
    ? ["Jordan Lee", "Sam Carter", "Riley Chen"]
    : ["Alex Morgan", "Jamie Rivera", "Taylor Kim"];
  const name = demoNames[Math.floor(Math.random() * demoNames.length)];
  const [firstName, lastName] = name.split(' ');
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@gmail.com`;
  return role === 'business'
    ? { role, firstName, lastName, email, company: `${firstName}'s Startup`, industry: 'SaaS', createdAt: Date.now(), authMethod: 'google' }
    : { role, firstName, lastName, email, school: 'State University', major: 'Undeclared', age: '20', createdAt: Date.now(), authMethod: 'google' };
}

// ═══════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════
function LoginScreen({ role, onSuccess, onSwitchToRegister, onBack }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    haptic();
    setErr('');
    setLoading(true);
    try {
      await beginGoogleAuth(role);
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) { setErr('Enter a valid email'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    haptic();
    setErr('');
    setLoading(true);
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (role && !data.session?.user?.user_metadata?.role) {
        await supabase.auth.updateUser({
          data: { ...(data.session?.user?.user_metadata || {}), role },
        });
      }
      const profile = await syncSupabaseProfile(data.session, role);
      if (profile.role !== role) throw new Error(`This account is registered as a ${profile.role}`);
      onSuccess(profile);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
    return;
    // Try to load saved profile matching this email
    const saved = LS.get('vx_accounts', []);
    const match = saved.find(a => a.email === email && a.role === role);
    if (!match) { setErr("No account found for that email — try signing up"); return; }
    onSuccess(match);
  };

  return (
    <div className="app">
      <div className="auth page">
        <button className="auth-back" onClick={onBack}>← Back</button>
        <div className="auth-logo">Valid<span>X</span></div>
        <div className="auth-role-pill">
          {role === 'business' ? '💼 Business' : '🎓 Tester'}
        </div>
        <h1>Welcome back</h1>
        <p className="auth-sub">Log in to continue to your {role === 'business' ? 'dashboard' : 'experiments'}.</p>

        <GoogleButton label={loading ? "Connecting..." : "Continue with Google"} onClick={handleGoogle} />

        <div className="auth-divider">OR</div>

        <form onSubmit={handleSubmit} className="auth-fields">
          <div className="form-group" style={{margin:0}}>
            <label>Email</label>
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} placeholder="you@email.com" autoComplete="email" />
          </div>
          <div className="form-group" style={{margin:0}}>
            <label>Password</label>
            <PasswordField
              value={password}
              onChange={e => { setPassword(e.target.value); setErr(''); }}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>
          {err && <div className="field-error">{err}</div>}
          <button type="submit" className="btn btn-primary btn-lg btn-block auth-submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <div className="auth-switch">
          New to ValidX? <button type="button" onClick={onSwitchToRegister}>Create account</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// REGISTER SCREEN
// ═══════════════════════════════════════════════════
function RegisterScreen({ role, onSuccess, onSwitchToLogin, onBack }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Business fields
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('SaaS');
  const [companySize, setCompanySize] = useState('1-10');
  // Tester fields
  const [school, setSchool] = useState('');
  const [major, setMajor] = useState('');
  const [age, setAge] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    haptic();
    setErr('');
    setLoading(true);
    try {
      await beginGoogleAuth(role);
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!firstName.trim() || !lastName.trim()) return setErr('Please enter your name');
    if (!email.includes('@')) return setErr('Enter a valid email');
    if (password.length < 6) return setErr('Password must be at least 6 characters');
    if (role === 'business') {
      if (!company.trim()) return setErr('Please enter your company name');
    } else {
      if (!school.trim()) return setErr('Please enter your school');
      const ageN = parseInt(age, 10);
      if (!ageN || ageN < 18) return setErr('You must be 18 or older to join as a tester');
    }

    const profile = role === 'business'
      ? { role, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), company: company.trim(), industry, companySize, createdAt: Date.now(), authMethod: 'email' }
      : { role, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), school: school.trim(), major: major.trim(), age, createdAt: Date.now(), authMethod: 'email' };

    setLoading(true);
    try {
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: profile.email,
        password,
        options: {
          emailRedirectTo: window.location.href.split('#')[0],
          data: profile,
        },
      });
      if (error) throw error;
      if (!data.session) {
        setErr('Check your email to confirm your account, then log in.');
        return;
      }
      const synced = await syncSupabaseProfile(data.session, role);
      haptic();
      onSuccess(synced);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
    return;

    // Save to accounts (in production, this hits the backend)
    const accounts = LS.get('vx_accounts', []);
    if (accounts.find(a => a.email === profile.email && a.role === profile.role)) {
      return setErr('An account already exists with that email');
    }
    LS.set('vx_accounts', [...accounts, profile]);
    haptic();
    onSuccess(profile);
  };

  return (
    <div className="app">
      <div className="auth page">
        <button className="auth-back" onClick={onBack}>← Back</button>
        <div className="auth-logo">Valid<span>X</span></div>
        <div className="auth-role-pill">
          {role === 'business' ? '💼 Business account' : '🎓 Tester account'}
        </div>
        <h1>{role === 'business' ? 'Launch your first test' : 'Start earning today'}</h1>
        <p className="auth-sub">
          {role === 'business'
            ? 'Create an account to run validation experiments.'
            : 'Join the tester network and get paid for sharing real market feedback.'}
        </p>

        <GoogleButton label={loading ? "Connecting..." : "Sign up with Google"} onClick={handleGoogle} />

        <div className="auth-divider">OR</div>

        <form onSubmit={handleSubmit} className="auth-fields">
          <div className="auth-row">
            <div className="form-group" style={{margin:0}}>
              <label>First name</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" />
            </div>
            <div className="form-group" style={{margin:0}}>
              <label>Last name</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" />
            </div>
          </div>
          <div className="form-group" style={{margin:0}}>
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
          </div>
          <div className="form-group" style={{margin:0}}>
            <label>Password</label>
            <PasswordField
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </div>

          {role === 'business' ? (
            <>
              <div className="form-group" style={{margin:0}}>
                <label>Company name</label>
                <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Acme Labs" autoComplete="organization" />
              </div>
              <div className="auth-row">
                <div className="form-group" style={{margin:0}}>
                  <label>Industry</label>
                  <select value={industry} onChange={e => { haptic(5); setIndustry(e.target.value); }}>
                    <option>SaaS</option>
                    <option>Consumer Goods</option>
                    <option>E-commerce</option>
                    <option>Fintech</option>
                    <option>Health & Wellness</option>
                    <option>Education</option>
                    <option>Food & Beverage</option>
                    <option>Media</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="form-group" style={{margin:0}}>
                  <label>Team size</label>
                  <select value={companySize} onChange={e => { haptic(5); setCompanySize(e.target.value); }}>
                    <option>1-10</option>
                    <option>11-50</option>
                    <option>51-200</option>
                    <option>200+</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{margin:0}}>
                <label>School / University</label>
                <input type="text" value={school} onChange={e => setSchool(e.target.value)} placeholder="e.g. State University" />
              </div>
              <div className="auth-row">
                <div className="form-group" style={{margin:0}}>
                  <label>Major</label>
                  <input type="text" value={major} onChange={e => setMajor(e.target.value)} placeholder="Business" />
                </div>
                <div className="form-group" style={{margin:0}}>
                  <label>Age</label>
                  <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="18+" min="18" max="99" />
                </div>
              </div>
              <div className="hint-sm">You must be 18+ to join the tester network. We use this to match you with relevant experiments.</div>
            </>
          )}

          {err && <div className="field-error">{err}</div>}

          <button type="submit" className="btn btn-primary btn-lg btn-block auth-submit" disabled={loading}>
            {loading ? 'Creating account...' : `Create ${role === 'business' ? 'Business' : 'Tester'} Account`}
          </button>
        </form>

        <div className="auth-terms">
          By continuing, you agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
        </div>

        <div className="auth-switch">
          Already have an account? <button type="button" onClick={onSwitchToLogin}>Log in</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PULL TO REFRESH HOOK
// ═══════════════════════════════════════════════════
function usePullToRefresh(ref, onRefresh) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (el.scrollTop === 0) startY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
      if (el.scrollTop === 0 && startY.current > 0) {
        const dist = e.touches[0].clientY - startY.current;
        if (dist > 0 && dist < 120) {
          setPullDistance(dist);
          setPulling(true);
        }
      }
    };
    const onTouchEnd = () => {
      if (pullDistance > 70) {
        setRefreshing(true);
        haptic(30);
        Promise.resolve(onRefresh()).finally(() => {
          setTimeout(() => { setRefreshing(false); setPullDistance(0); setPulling(false); }, 800);
        });
      } else {
        setPullDistance(0);
        setPulling(false);
      }
      startY.current = 0;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref, onRefresh, pullDistance]);

  return { pulling, pullDistance, refreshing };
}

// ═══════════════════════════════════════════════════
// BUSINESS APP
// ═══════════════════════════════════════════════════
function BusinessApp({ profile, experiments, setExperiments, onLogout, showToast }) {
  const [tab, setTab] = useState('dashboard');
  const [viewingId, setViewingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const mainRef = useRef(null);

  const myExperiments = experiments.filter(e => e.createdBy === 'business');
  const active = myExperiments.filter(e => e.status === 'active');
  const totalSubmissions = myExperiments.reduce((s, e) => s + e.submissions.length, 0);
  const totalBudget = myExperiments.reduce((s, e) => s + e.budget, 0);
  const viewing = viewingId ? experiments.find(e => e.id === viewingId) : null;

  const { pullDistance, refreshing } = usePullToRefresh(mainRef, () => showToast('Dashboard refreshed'));

  const changeTab = (t) => { haptic(); setTab(t); setCreating(false); setViewingId(null); };

  function handleCreate(exp) {
    setExperiments(prev => [...prev, { ...exp, id: Date.now(), createdAt: new Date().toISOString().slice(0,10), createdBy: 'business', submissions: [], status: 'active' }]);
    setCreating(false);
    setTab('dashboard');
    haptic([20, 40, 20]);
    showToast('Experiment launched!');
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">Valid<span>X</span></div>
        <div className="topbar-right">
          <span className="topbar-role business">{profile?.company || 'Business'}</span>
          <button className="topbar-btn" onClick={onLogout}>Log out</button>
        </div>
      </div>

      <div className="main" ref={mainRef}>
        <div className={`ptr-indicator ${pullDistance > 30 || refreshing ? 'visible' : ''} ${refreshing ? 'refreshing' : ''}`}>↻</div>
        {creating ? (
          <div className="page"><CreateExperiment onSubmit={handleCreate} onCancel={() => { haptic(); setCreating(false); }} /></div>
        ) : viewing ? (
          <div className="page"><ExperimentDetail experiment={viewing} onBack={() => { haptic(); setViewingId(null); }} /></div>
        ) : tab === 'dashboard' ? (
          <div className="page">
            <div className="section-header">
              <div>
                <div className="section-title">Dashboard</div>
                <div className="section-sub">Track your experiments</div>
              </div>
            </div>
            <div className="stats-row">
              <div className="stat-card"><div className="num">{myExperiments.length}</div><div className="label">Total</div></div>
              <div className="stat-card"><div className="num" style={{color:'var(--green-lt)'}}>{active.length}</div><div className="label">Active</div></div>
              <div className="stat-card"><div className="num" style={{color:'var(--cyan)'}}>{totalSubmissions}</div><div className="label">Submissions</div></div>
              <div className="stat-card"><div className="num">${totalBudget}</div><div className="label">Spent</div></div>
            </div>
            {myExperiments.length === 0 ? (
              <div className="empty">
                <div className="icon">🔬</div>
                <p>No experiments yet. Tap + to create your first one.</p>
              </div>
            ) : (
              myExperiments.map(exp => (
                <div className="card tappable" key={exp.id} onClick={() => { haptic(); setViewingId(exp.id); }}>
                  <div className="card-header">
                    <div style={{flex:1}}>
                      <h3>{exp.title}</h3>
                      <p style={{marginTop:4}}>{exp.assumption}</p>
                    </div>
                    <span className={`badge badge-${exp.status}`}>{exp.status}</span>
                  </div>
                  <div style={{display:'flex',gap:14,fontSize:'.76rem',color:'var(--text-med)',marginTop:10,flexWrap:'wrap'}}>
                    <span>💰 ${exp.budget}</span>
                    <span>📋 {exp.submissions.length} submissions</span>
                    <span>📅 {exp.createdAt}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : tab === 'results' ? (
          <div className="page">
            <div className="section-header">
              <div>
                <div className="section-title">Results</div>
                <div className="section-sub">All tester submissions</div>
              </div>
            </div>
            {myExperiments.filter(e => e.submissions.length > 0).length === 0 ? (
              <div className="empty"><div className="icon">📊</div><p>No results yet. Testers will submit data as they complete your experiments.</p></div>
            ) : (
              myExperiments.filter(e => e.submissions.length > 0).map(exp => (
                <div key={exp.id} style={{marginBottom:24}}>
                  <h3 style={{fontSize:'.95rem',fontWeight:700,color:'var(--white)',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
                    {exp.title}<span className={`badge badge-${exp.status}`}>{exp.status}</span>
                  </h3>
                  {exp.submissions.map(sub => (
                    <div className="submission" key={sub.id}>
                      <div className="submission-header">
                        <span className="tester-name">{sub.testerName}</span>
                        <span className="meta">{sub.date}</span>
                      </div>
                      <div className="notes">{sub.notes}</div>
                      <div className="files-row">
                        {sub.files.map((f, i) => <span className="file-tag" key={i}>📎 {f}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>

      {!creating && !viewing && tab === 'dashboard' && (
        <button className="fab" onClick={() => { haptic(); setCreating(true); }}>+</button>
      )}

      <div className="bottom-nav">
        <div className={`nav-item ${tab === 'dashboard' && !creating && !viewing ? 'active' : ''}`} onClick={() => changeTab('dashboard')}>
          <span className="icon">🏠</span>Dashboard
        </div>
        <div className={`nav-item ${creating ? 'active' : ''}`} onClick={() => { haptic(); setCreating(true); setViewingId(null); }}>
          <span className="icon">➕</span>Create
        </div>
        <div className={`nav-item ${tab === 'results' ? 'active' : ''}`} onClick={() => changeTab('results')}>
          <span className="icon">📊</span>Results
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// CREATE EXPERIMENT
// ═══════════════════════════════════════════════════
function CreateExperiment({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [assumption, setAssumption] = useState('');
  const [type, setType] = useState('pricing');
  const [tier, setTier] = useState('deep-dive');
  const [payMethod, setPayMethod] = useState('stripe');
  const info = TIER_INFO[tier];

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !assumption.trim()) return;
    onSubmit({ title: title.trim(), assumption: assumption.trim(), type, tier, budget: info.price, paidWith: payMethod === 'stripe' ? 'Stripe' : 'PayPal' });
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>← Back</button>
      </div>
      <div className="section-title" style={{marginBottom:6}}>Create Experiment</div>
      <div className="section-sub" style={{marginBottom:22}}>Launch a new validation test</div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Experiment Title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Pricing test for HealthBot" />
        </div>
        <div className="form-group">
          <label>Your Riskiest Assumption</label>
          <textarea value={assumption} onChange={e => setAssumption(e.target.value)} placeholder="College students will pay $15/month for an AI health chatbot" rows={4} />
          <div className="hint">Frame it as a testable hypothesis.</div>
        </div>
        <div className="form-group">
          <label>Type</label>
          <select value={type} onChange={e => { haptic(5); setType(e.target.value); }}>
            <option value="pricing">Pricing Sensitivity</option>
            <option value="feature">Feature Priority</option>
            <option value="value-prop">Value Proposition</option>
            <option value="channel">Channel Strategy</option>
            <option value="landing">Landing Page Conversion</option>
            <option value="brand">Brand Positioning</option>
          </select>
        </div>
        <div className="form-group">
          <label>Validation Tier</label>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {Object.entries(TIER_INFO).map(([key, val]) => (
              <div key={key} onClick={() => { haptic(); setTier(key); }} style={{
                padding:'16px 18px',borderRadius:'var(--radius-sm)',
                border: tier === key ? '2px solid var(--indigo)' : '1.5px solid var(--dark3)',
                background: tier === key ? 'rgba(99,102,241,.1)' : 'var(--dark)',
                transition:'all .15s',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12
              }}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:'.95rem',color:'var(--white)'}}>{val.name}</div>
                  <div style={{fontSize:'.74rem',color:'var(--text-med)',marginTop:2}}>Reach {val.reach} people per tester</div>
                </div>
                <div style={{fontSize:'1.4rem',fontWeight:800,color: tier === key ? 'var(--cyan)' : 'var(--indigo-lt)'}}>${val.price}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label>Payment Method</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[
              { id: 'stripe', name: 'Stripe', sub: 'Card / Apple Pay', icon: '💳' },
              { id: 'paypal', name: 'PayPal', sub: 'PayPal balance', icon: '🅿️' },
            ].map(m => (
              <div key={m.id} onClick={() => { haptic(); setPayMethod(m.id); }} style={{
                padding:'14px 12px',borderRadius:'var(--radius-sm)',
                border: payMethod === m.id ? '2px solid var(--indigo)' : '1.5px solid var(--dark3)',
                background: payMethod === m.id ? 'rgba(99,102,241,.1)' : 'var(--dark)',
                display:'flex',flexDirection:'column',alignItems:'center',gap:4,transition:'all .15s'
              }}>
                <div style={{fontSize:'1.4rem'}}>{m.icon}</div>
                <div style={{fontSize:'.85rem',fontWeight:700,color:'var(--white)'}}>{m.name}</div>
                <div style={{fontSize:'.68rem',color:'var(--text-med)'}}>{m.sub}</div>
              </div>
            ))}
          </div>
          <div className="hint">🔒 Secure checkout. You're charged when the experiment launches.</div>
        </div>
        <div className="card" style={{background:'var(--dark)',borderColor:'var(--indigo)',marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'.74rem',color:'var(--text-med)',textTransform:'uppercase',letterSpacing:'.5px'}}>Total</div>
              <div style={{fontSize:'1.8rem',fontWeight:800,color:'var(--white)'}}>${info.price}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:'.78rem',color:'var(--text-med)'}}>{info.name}</div>
              <div style={{fontSize:'.78rem',color:'var(--cyan)',marginTop:2}}>{info.reach} people/tester</div>
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!title.trim() || !assumption.trim()}>
          Checkout with {payMethod === 'stripe' ? 'Stripe' : 'PayPal'} — ${info.price}
        </button>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// EXPERIMENT DETAIL
// ═══════════════════════════════════════════════════
function ExperimentDetail({ experiment, onBack }) {
  const info = TIER_INFO[experiment.tier];
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <span className={`badge badge-${experiment.status}`}>{experiment.status}</span>
      </div>
      <h2 style={{fontSize:'1.35rem',fontWeight:800,color:'var(--white)',marginBottom:8,lineHeight:1.2}}>{experiment.title}</h2>
      <p style={{fontSize:'.88rem',color:'var(--text-med)',marginBottom:20,lineHeight:1.55}}>{experiment.assumption}</p>
      <div className="stats-row">
        <div className="stat-card"><div className="num">{experiment.submissions.length}</div><div className="label">Submissions</div></div>
        <div className="stat-card"><div className="num">${experiment.budget}</div><div className="label">{info?.name}</div></div>
      </div>
      <h3 style={{fontSize:'1rem',fontWeight:700,color:'var(--white)',marginBottom:14}}>Tester Submissions</h3>
      {experiment.submissions.length === 0 ? (
        <div className="empty"><div className="icon">⏳</div><p>Waiting for testers to submit data. Check back soon!</p></div>
      ) : (
        experiment.submissions.map(sub => (
          <div className="submission" key={sub.id}>
            <div className="submission-header">
              <span className="tester-name">{sub.testerName}</span>
              <span className="meta">{sub.date}</span>
            </div>
            <div className="notes">{sub.notes}</div>
            <div className="files-row">
              {sub.files.map((f, i) => <span className="file-tag" key={i}>📎 {f}</span>)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// TESTER APP
// ═══════════════════════════════════════════════════
function TesterApp({ profile, experiments, setExperiments, earnings, setEarnings, txns, setTxns, claimedIds, setClaimedIds, onLogout, showToast }) {
  const [tab, setTab] = useState('browse');
  const [uploadingId, setUploadingId] = useState(null);
  const [cashoutOpen, setCashoutOpen] = useState(false);
  const mainRef = useRef(null);

  const available = experiments.filter(e => e.status === 'active' && !claimedIds.includes(e.id));
  const claimed = experiments.filter(e => claimedIds.includes(e.id));
  const completedCount = txns.filter(t => t.type === 'earned').length;

  const { pullDistance, refreshing } = usePullToRefresh(mainRef, () => showToast('Refreshed'));

  const changeTab = (t) => { haptic(); setTab(t); setUploadingId(null); };

  function handleClaim(id) {
    haptic([20, 30, 20]);
    setClaimedIds(prev => [...prev, id]);
    showToast('Experiment claimed!');
  }

  function handleSubmitData(expId, notes, files) {
    const newSub = {
      id: Date.now(), testerName: "You", date: new Date().toISOString().slice(0, 10),
      notes, files: files.map(f => f.name),
    };
    setExperiments(prev => prev.map(e => e.id === expId ? { ...e, submissions: [...e.submissions, newSub] } : e));
    const exp = experiments.find(e => e.id === expId);
    const payout = exp ? Math.round(TIER_INFO[exp.tier]?.price * 0.3) : 10;
    setEarnings(prev => prev + payout);
    setTxns(prev => [...prev, { id: Date.now(), desc: exp?.title || 'Experiment', amount: payout, type: 'earned', date: new Date().toISOString().slice(0, 10) }]);
    setClaimedIds(prev => prev.filter(i => i !== expId));
    setUploadingId(null);
    setTab('earnings');
    haptic([40, 60, 40]);
    showToast(`You earned $${payout}!`);
  }

  function handleCashout(amount, method) {
    setEarnings(prev => prev - amount);
    setTxns(prev => [...prev, { id: Date.now(), desc: `Withdrawal via ${method}`, amount, type: 'withdrawn', date: new Date().toISOString().slice(0, 10) }]);
    setCashoutOpen(false);
    haptic([30, 50, 30]);
    showToast(`$${amount.toFixed(2)} withdrawn!`);
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="logo">Valid<span>X</span></div>
        <div className="topbar-right">
          <span className="topbar-role tester">{profile?.firstName ? `${profile.firstName} · Tester` : 'Tester'}</span>
          <button className="topbar-btn" onClick={onLogout}>Log out</button>
        </div>
      </div>

      <div className="main" ref={mainRef}>
        <div className={`ptr-indicator ${pullDistance > 30 || refreshing ? 'visible' : ''} ${refreshing ? 'refreshing' : ''}`}>↻</div>
        {uploadingId ? (
          <div className="page"><UploadData experiment={experiments.find(e => e.id === uploadingId)} onSubmit={(notes, files) => handleSubmitData(uploadingId, notes, files)} onCancel={() => { haptic(); setUploadingId(null); }} /></div>
        ) : tab === 'browse' ? (
          <div className="page">
            <div className="section-header">
              <div>
                <div className="section-title">Browse</div>
                <div className="section-sub">Pick up a test, earn money</div>
              </div>
            </div>
            {available.length === 0 ? (
              <div className="empty"><div className="icon">🔍</div><p>No new experiments right now. Pull down to refresh!</p></div>
            ) : (
              available.map(exp => {
                const info = TIER_INFO[exp.tier];
                return (
                  <div className="card" key={exp.id}>
                    <div className="card-header">
                      <div style={{flex:1}}>
                        <h3>{exp.title}</h3>
                        <p style={{marginTop:4}}>{exp.assumption}</p>
                      </div>
                      <span className="badge badge-budget">${info?.price}</span>
                    </div>
                    <div style={{display:'flex',gap:12,fontSize:'.74rem',color:'var(--text-med)',margin:'12px 0 14px',flexWrap:'wrap'}}>
                      <span>🎯 {exp.type}</span>
                      <span>👥 Reach {info?.reach}</span>
                      <span>💵 Earn ~${Math.round(info?.price * 0.3)}</span>
                    </div>
                    <button className="btn btn-cyan btn-block" onClick={() => handleClaim(exp.id)}>Claim This Test</button>
                  </div>
                );
              })
            )}
          </div>
        ) : tab === 'active' ? (
          <div className="page">
            <div className="section-header">
              <div>
                <div className="section-title">My Tests</div>
                <div className="section-sub">Upload data when you're done</div>
              </div>
            </div>
            {claimed.length === 0 ? (
              <div className="empty">
                <div className="icon">📋</div>
                <p>No claimed experiments. Browse to find some!</p>
                <button className="btn btn-primary btn-sm" onClick={() => changeTab('browse')}>Browse Experiments</button>
              </div>
            ) : (
              claimed.map(exp => {
                const info = TIER_INFO[exp.tier];
                return (
                  <div className="card" key={exp.id}>
                    <div className="card-header">
                      <div style={{flex:1}}>
                        <h3>{exp.title}</h3>
                        <p style={{marginTop:4}}>{exp.assumption}</p>
                      </div>
                      <span className="badge badge-active">Active</span>
                    </div>
                    <div style={{display:'flex',gap:12,fontSize:'.74rem',color:'var(--text-med)',margin:'12px 0 14px',flexWrap:'wrap'}}>
                      <span>👥 Reach {info?.reach} people</span>
                      <span>💵 Earn ~${Math.round(info?.price * 0.3)}</span>
                    </div>
                    <button className="btn btn-green btn-block" onClick={() => { haptic(); setUploadingId(exp.id); }}>Upload Data</button>
                  </div>
                );
              })
            )}
          </div>
        ) : tab === 'earnings' ? (
          <div className="page">
            <div className="earnings-banner">
              <div className="label">Available Balance</div>
              <div className="amount">${earnings.toFixed(2)}</div>
              {earnings > 0 && <button className="btn btn-cyan" onClick={() => { haptic(); setCashoutOpen(true); }}>Cash Out</button>}
            </div>
            <div className="stats-row">
              <div className="stat-card"><div className="num">{completedCount}</div><div className="label">Completed</div></div>
              <div className="stat-card"><div className="num">${txns.filter(t=>t.type==='earned').reduce((s,t)=>s+t.amount,0).toFixed(0)}</div><div className="label">Total Earned</div></div>
            </div>
            <h3 style={{fontSize:'.95rem',fontWeight:700,color:'var(--white)',marginBottom:12}}>History</h3>
            <div className="tx-list">
              {txns.slice().reverse().map(tx => (
                <div className="tx-item" key={tx.id}>
                  <div>
                    <div className="desc">{tx.desc}</div>
                    <div className="date">{tx.date}</div>
                  </div>
                  <div className={`amount ${tx.type}`}>{tx.type === 'earned' ? '+' : '-'}${tx.amount.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {cashoutOpen && <CashoutSheet balance={earnings} onCashout={handleCashout} onClose={() => { haptic(); setCashoutOpen(false); }} />}

      <div className="bottom-nav">
        <div className={`nav-item ${tab === 'browse' && !uploadingId ? 'active' : ''}`} onClick={() => changeTab('browse')}>
          <span className="icon">🔍</span>Browse
        </div>
        <div className={`nav-item ${tab === 'active' ? 'active' : ''}`} onClick={() => changeTab('active')}>
          <span className="icon">📋</span>My Tests
        </div>
        <div className={`nav-item ${tab === 'earnings' ? 'active' : ''}`} onClick={() => changeTab('earnings')}>
          <span className="icon">💰</span>Earnings
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// UPLOAD DATA
// ═══════════════════════════════════════════════════
function UploadData({ experiment, onSubmit, onCancel }) {
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);

  function addFiles(e) {
    haptic();
    const newFiles = Array.from(e.target.files);
    setFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  }
  function removeFile(idx) {
    haptic();
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>← Back</button>
      </div>
      <div className="section-title" style={{marginBottom:6}}>Upload Data</div>
      <div className="section-sub" style={{marginBottom:20}}>Share your findings</div>

      <div className="card" style={{marginBottom:20}}>
        <h3>{experiment?.title}</h3>
        <p style={{marginTop:6}}>{experiment?.assumption}</p>
      </div>
      <div className="form-group">
        <label>Your Findings</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe what you did, who you talked to, and what you found. Be specific — include numbers and quotes." rows={6} />
        <div className="hint">The more detailed, the more valuable your submission.</div>
      </div>
      <div className="form-group">
        <label>Upload Files</label>
        <div className="upload-zone">
          <div className="icon">📁</div>
          <p>Tap to browse files</p>
          <p style={{fontSize:'.72rem',marginTop:4,opacity:.7}}>Photos, CSVs, PDFs, screenshots</p>
          <input type="file" multiple onChange={addFiles} />
        </div>
        {files.length > 0 && (
          <div className="file-list">
            {files.map((f, i) => (
              <div className="file-item" key={i}>
                <div style={{flex:1,minWidth:0}}>
                  <div className="name">{f.name}</div>
                  <div className="size">{(f.size / 1024).toFixed(1)} KB</div>
                </div>
                <button className="remove" onClick={() => removeFile(i)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="btn btn-green btn-lg btn-block" onClick={() => onSubmit(notes, files)} disabled={!notes.trim()}>
        Submit &amp; Get Paid
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// CASHOUT BOTTOM SHEET
// ═══════════════════════════════════════════════════
function CashoutSheet({ balance, onCashout, onClose }) {
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState('stripe');

  const methods = [
    { id: 'stripe', name: 'Stripe', sub: 'Instant to debit card', icon: '💳' },
    { id: 'paypal', name: 'PayPal', sub: 'To your PayPal account', icon: '🅿️' },
  ];

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}></div>
      <div className="sheet">
        <div className="sheet-handle"></div>
        <h3>Cash Out</h3>
        <div className="form-group">
          <label>Amount</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="1" max={balance} step="0.01" />
          <div className="hint">Available: ${balance.toFixed(2)}</div>
        </div>
        <div className="form-group">
          <label>Payout Method</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {methods.map(m => (
              <div key={m.id} onClick={() => { haptic(); setMethod(m.id); }} style={{
                padding:'16px 12px',borderRadius:'var(--radius-sm)',
                border: method === m.id ? '2px solid var(--cyan)' : '1.5px solid var(--dark3)',
                background: method === m.id ? 'rgba(6,182,212,.1)' : 'var(--dark)',
                display:'flex',flexDirection:'column',alignItems:'center',gap:4,transition:'all .15s'
              }}>
                <div style={{fontSize:'1.5rem'}}>{m.icon}</div>
                <div style={{fontSize:'.85rem',fontWeight:700,color:'var(--white)'}}>{m.name}</div>
                <div style={{fontSize:'.68rem',color:'var(--text-med)',textAlign:'center'}}>{m.sub}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:'flex',gap:12,marginTop:6}}>
          <button className="btn btn-outline" style={{flex:1}} onClick={onClose}>Cancel</button>
          <button className="btn btn-green" style={{flex:1.5}} onClick={() => { const amt = parseFloat(amount); if (amt > 0 && amt <= balance) onCashout(amt, methods.find(m => m.id === method).name); }}>
            Withdraw ${parseFloat(amount || 0).toFixed(2)}
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════
export default App;


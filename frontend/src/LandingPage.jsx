
import { useState } from "react";

const features = [
  {
    icon: "📸",
    title: "Photo-assisted reporting",
    text: "Attach clear photo evidence so the municipal team can assess each issue.",
    color: "bg-emerald-50",
  },
  {
    icon: "📍",
    title: "Location Intelligence",
    text: "Connect civic complaints with their reported locations.",
    color: "bg-blue-50",
  },
  {
    icon: "📊",
    title: "Smart City Analytics",
    text: "Help city teams prioritize and resolve local issues.",
    color: "bg-amber-50",
  },
];

export default function LandingPage({ onReportIssue, onDashboard }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7faf8] text-slate-800">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <button
            onClick={onDashboard}
            className="flex items-center gap-3 text-left"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-700 text-lg font-black text-white shadow-lg shadow-emerald-900/15">
              RC
            </span>
            <span>
              <span className="block text-lg font-extrabold tracking-tight">
                RewaCivic<span className="text-emerald-700">AI</span>
              </span>
              <span className="block text-[10px] font-bold tracking-[0.18em] text-slate-500">
                SMARTER CITY. BETTER TOMORROW.
              </span>
            </span>
          </button>

          <button
            className="rounded-xl border border-slate-200 px-3 py-2 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>

          <div
            className={`${menuOpen ? "flex" : "hidden"} absolute left-0 right-0 top-full flex-col gap-4 border-b bg-white p-5 md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0`}
          >
            <a href="#features" className="text-sm font-medium text-slate-600 hover:text-emerald-700">
              Features
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-emerald-700">
              How it works
            </a>
            <button
              onClick={onDashboard}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:bg-slate-50"
            >
              Admin Dashboard ↗
            </button>
            <button
              onClick={onReportIssue}
              className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:bg-emerald-800"
            >
              Report an Issue +
            </button>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-32 -top-24 h-96 w-96 rounded-full bg-emerald-100/70 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-lime-100/60 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 md:py-24 lg:grid-cols-2 lg:px-8">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-bold text-emerald-800 shadow-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                A smarter civic experience for Rewa
              </div>

              <h1 className="max-w-2xl text-5xl font-black leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
                Your city.
                <br />
                Your voice.
                <br />
                <span className="text-emerald-700">Real change.</span>
              </h1>

              <p className="mt-7 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                Report civic issues, share their location and help make
                Rewa cleaner and safer with easy issue reporting, map-based
                locations and transparent progress tracking.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={onReportIssue}
                  className="rounded-2xl bg-emerald-700 px-7 py-4 font-bold text-white shadow-xl shadow-emerald-900/15 transition hover:-translate-y-1 hover:bg-emerald-800"
                >
                  📸 Report a Civic Issue <span className="ml-2">→</span>
                </button>
                <button
                  onClick={onDashboard}
                  className="rounded-2xl border border-slate-200 bg-white px-7 py-4 font-bold shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  Explore Dashboard ↗
                </button>
              </div>

              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
                <span>✓ Easy reporting</span>
                <span>✓ Track issue status</span>
                <span>✓ City-focused insights</span>
              </div>
            </div>

            {/* Visual feature panel */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-emerald-200/60 to-lime-100/50 blur-2xl" />

              <div className="relative overflow-hidden rounded-[2rem] border border-white bg-white p-5 shadow-2xl shadow-emerald-950/10 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                      Civic intelligence
                    </p>
                    <h2 className="mt-2 text-xl font-extrabold">
                      Rewa City Overview
                    </h2>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                    Preview
                  </span>
                </div>

                <div className="relative mt-6 flex min-h-64 items-center justify-center overflow-hidden rounded-2xl bg-[#eaf2e5] p-5">
                  <div className="absolute inset-0 opacity-60"
                    style={{
                      backgroundImage:
                        "linear-gradient(30deg, transparent 46%, white 47%, white 50%, transparent 51%), linear-gradient(120deg, transparent 42%, white 43%, white 46%, transparent 47%), linear-gradient(170deg, transparent 62%, #d5e5d0 63%, #d5e5d0 67%, transparent 68%)",
                      backgroundSize: "190px 160px, 220px 180px, 180px 150px",
                    }}
                  />

                  <div className="absolute left-[13%] top-[18%] rounded-xl border border-white bg-white px-3 py-2 text-xs font-bold shadow-md">
                    Civil Lines
                  </div>
                  <div className="absolute bottom-[17%] right-[7%] rounded-xl border border-white bg-white px-3 py-2 text-xs font-bold shadow-md">
                    University Road
                  </div>

                  <span className="absolute left-[26%] top-[42%] grid h-12 w-12 place-items-center rounded-2xl border-4 border-white bg-emerald-600 text-xl shadow-lg">
                    ♻️
                  </span>
                  <span className="absolute right-[24%] top-[25%] grid h-12 w-12 place-items-center rounded-2xl border-4 border-white bg-amber-500 text-xl shadow-lg">
                    ⚠️
                  </span>
                  <span className="absolute bottom-[19%] left-[47%] grid h-12 w-12 place-items-center rounded-2xl border-4 border-white bg-rose-500 text-xl shadow-lg">
                    📍
                  </span>

                  <div className="absolute bottom-3 left-3 rounded-xl border border-white/80 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow">
                    📍 Rewa, Madhya Pradesh
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Illustrative map preview. Live map pins will be connected
                  to actual reported coordinates in a later step.
                </p>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-emerald-50 p-3">
                    <span className="text-xl">♻️</span>
                    <p className="mt-2 text-xs font-bold text-slate-800">Garbage</p>
                    <p className="mt-1 text-[10px] text-slate-500">Issue category</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3">
                    <span className="text-xl">🛣️</span>
                    <p className="mt-2 text-xs font-bold text-slate-800">Potholes</p>
                    <p className="mt-1 text-[10px] text-slate-500">Road safety</p>
                  </div>
                  <div className="rounded-2xl bg-blue-50 p-3">
                    <span className="text-xl">🤖</span>
                    <p className="mt-2 text-xs font-bold text-slate-800">Civic Updates</p>
                    <p className="mt-1 text-[10px] text-slate-500">Detection feature</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-slate-200/70 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700">
                Built for better cities
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Small reports. Meaningful impact.
              </h2>
              <p className="mt-4 leading-7 text-slate-600">
                A connected workflow to help citizens report issues and
                help civic teams respond with better information.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="group rounded-3xl border border-slate-200 bg-white p-7 transition duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-950/5"
                >
                  <div className={`grid h-14 w-14 place-items-center rounded-2xl text-2xl ${feature.color}`}>
                    {feature.icon}
                  </div>
                  <h3 className="mt-6 text-lg font-extrabold">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {feature.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow */}
        <section id="how-it-works" className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="rounded-[2rem] bg-slate-900 px-6 py-10 text-white sm:px-12 sm:py-14">
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                  Simple by design
                </p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">
                  From observation to action.
                </h2>
                <p className="mt-4 leading-7 text-slate-300">
                  Make a civic issue easier to report, review and resolve.
                </p>
              </div>

              <div className="mt-9 grid gap-6 sm:grid-cols-3">
                {[
                  ["01", "Report", "Describe the issue and add a photo."],
                  ["02", "Review", "The report enters the civic workflow."],
                  ["03", "Resolve", "Track progress as the team responds."],
                ].map(([number, title, description]) => (
                  <div key={number} className="border-t border-slate-700 pt-5">
                    <span className="text-sm font-black text-emerald-300">
                      {number}
                    </span>
                    <h3 className="mt-3 text-xl font-extrabold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {description}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={onReportIssue}
                className="mt-9 rounded-xl bg-emerald-500 px-6 py-3.5 font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                Start a Report →
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>
            <strong className="text-slate-800">RewaCivicAI</strong> ·
            Smart civic management for Rewa
          </p>
          <p>Designed for a cleaner, safer city. 💚</p>
        </div>
      </footer>
    </div>
  );
}

/**
 * App — Main application with routing.
 *
 * Routes:
 *   /        → Landing page (choose role)
 *   /staff   → Staff Dashboard
 *   /customer → Customer Dashboard
 */

import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import StaffDashboard from './pages/StaffDashboard';
import CustomerDashboard from './pages/CustomerDashboard';

function LandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        {/* Logo / Title */}
        <div className="mb-8">
          <div className="text-7xl mb-4">🏛️</div>
          <h1 className="text-4xl lg:text-5xl font-extrabold gradient-text mb-3">
            Linguist-Guardian
          </h1>
          <p className="text-lg text-gray-400 max-w-md mx-auto">
            Real-Time GenAI Banking Assistant for Union Bank of India
          </p>
        </div>

        {/* Feature badges */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {[
            '🎙️ Voice AI',
            '🌐 Bilingual',
            '🛡️ Compliance',
            '📋 FSM Guide',
            '📄 Doc Verify',
            '📝 Summaries',
          ].map((feat) => (
            <span
              key={feat}
              className="badge bg-white/5 text-gray-400 border border-white/10 text-sm px-3 py-1"
            >
              {feat}
            </span>
          ))}
        </div>

        {/* Role selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
          <Link
            to="/staff"
            className="glass-card-hover p-8 text-center group block"
          >
            <div className="text-5xl mb-3 group-hover:scale-110 transition-transform">
              👨‍💼
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">
              Staff Dashboard
            </h2>
            <p className="text-xs text-gray-500">
              Full suite: compliance, FSM, documents, summaries
            </p>
          </Link>

          <Link
            to="/customer"
            className="glass-card-hover p-8 text-center group block"
          >
            <div className="text-5xl mb-3 group-hover:scale-110 transition-transform">
              🧑
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">
              Customer Dashboard
            </h2>
            <p className="text-xs text-gray-500">
              Voice input, bilingual chat, translated responses
            </p>
          </Link>
        </div>

        {/* Footer */}
        <p className="mt-12 text-xs text-gray-600">
          Powered by GPT-4o • Whisper • SentenceTransformers • ChromaDB
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/staff" element={<StaffDashboard />} />
        <Route path="/customer" element={<CustomerDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

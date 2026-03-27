import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import StaffDashboard from './pages/StaffDashboard';
import CustomerDashboard from './pages/CustomerDashboard';

function LandingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center max-w-2xl w-full">

        {/* Header */}
        <div className="mb-8">
          <div className="w-20 h-20 rounded-2xl bg-blue-700 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-5">LG</div>
          <h1 className="text-4xl font-extrabold text-slate-800 mb-3">Linguist-Guardian</h1>
          <p className="text-slate-500 text-lg max-w-md mx-auto leading-relaxed">
            Real-Time AI Banking Assistant for Union Bank of India
          </p>
        </div>

        {/* Feature badges */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {['Voice AI', 'Bilingual', 'Compliance', 'FSM Guide', 'Doc Verify', 'Summaries'].map((feat) => (
            <span key={feat} className="badge badge-neutral text-sm px-3 py-1">{feat}</span>
          ))}
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-lg mx-auto">
          <Link to="/staff" className="bank-card p-8 text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 block group">
            <div className="w-14 h-14 rounded-xl bg-blue-700 flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 group-hover:bg-blue-800 transition-colors">ST</div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Staff Dashboard</h2>
            <p className="text-xs text-slate-500">Compliance, FSM tracker, documents, session summary</p>
          </Link>

          <Link to="/customer" className="bank-card p-8 text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 block group">
            <div className="w-14 h-14 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 group-hover:bg-emerald-700 transition-colors">CS</div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Customer Dashboard</h2>
            <p className="text-xs text-slate-500">Voice input, bilingual chat, translated responses</p>
          </Link>
        </div>

        {/* Footer */}
        <p className="mt-12 text-xs text-slate-400">
          Powered by GPT-4o &bull; Whisper &bull; SentenceTransformers &bull; ChromaDB
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<LandingPage />} />
        <Route path="/staff"    element={<StaffDashboard />} />
        <Route path="/customer" element={<CustomerDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
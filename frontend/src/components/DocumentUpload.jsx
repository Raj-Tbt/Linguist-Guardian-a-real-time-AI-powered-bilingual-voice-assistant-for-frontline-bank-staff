/**
 * DocumentUpload — Document verification UI.
 *
 * Allows the user to:
 *   1. Input mock OCR data (name, document number, DOB)
 *   2. Submit for verification against the fake user database
 *   3. View per-field verification results (Levenshtein, Jaro-Winkler, exact)
 */

import { useState } from 'react';
import { verifyDocument } from '../services/api';

export default function DocumentUpload() {
  const [formData, setFormData] = useState({
    document_type: 'aadhaar',
    extracted_name: '',
    extracted_number: '',
    extracted_dob: '',
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await verifyDocument(formData);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /** Auto-fill sample data for testing */
  const fillSample = () => {
    setFormData({
      document_type: 'aadhaar',
      extracted_name: 'Rajesh Kumar Sharma',
      extracted_number: '234567890123',
      extracted_dob: '15/03/1985',
    });
  };

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        📄 Document Verification
      </h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Document type selector */}
        <div className="flex gap-2">
          {['aadhaar', 'pan'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFormData({ ...formData, document_type: type })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                formData.document_type === type
                  ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
              }`}
            >
              {type === 'aadhaar' ? '🪪 Aadhaar' : '💳 PAN'}
            </button>
          ))}
        </div>

        <input
          name="extracted_name"
          value={formData.extracted_name}
          onChange={handleChange}
          placeholder="Full name (as on document)"
          className="glass-input text-sm"
          required
        />

        <input
          name="extracted_number"
          value={formData.extracted_number}
          onChange={handleChange}
          placeholder={formData.document_type === 'aadhaar' ? 'Aadhaar number (12 digits)' : 'PAN number (10 chars)'}
          className="glass-input text-sm"
          required
        />

        <input
          name="extracted_dob"
          value={formData.extracted_dob}
          onChange={handleChange}
          placeholder="Date of birth (DD/MM/YYYY)"
          className="glass-input text-sm"
          required
        />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex-1 text-sm"
          >
            {loading ? '⏳ Verifying...' : '🔍 Verify Document'}
          </button>
          <button
            type="button"
            onClick={fillSample}
            className="btn-secondary text-sm"
          >
            Sample
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-2 animate-slide-up">
          <div className={`p-3 rounded-lg border text-center ${
            result.verified
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <span className={`text-lg font-semibold ${
              result.verified ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {result.verified ? '✅ Verified' : '❌ Verification Failed'}
            </span>
            {!result.user_found && (
              <p className="text-xs text-gray-400 mt-1">User not found in database</p>
            )}
          </div>

          {/* Per-field results */}
          {result.results?.map((r, idx) => (
            <div
              key={idx}
              className={`p-2.5 rounded-lg border text-sm ${
                r.match
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-red-500/5 border-red-500/20'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-300 capitalize">
                  {r.field.replace(/_/g, ' ')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">{r.method}</span>
                  <span className={`text-xs font-mono ${
                    r.match ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {(r.score * 100).toFixed(1)}%
                  </span>
                  <span>{r.match ? '✓' : '✗'}</span>
                </div>
              </div>
              <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
                <span>Submitted: {r.submitted}</span>
                <span>Reference: {r.reference}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

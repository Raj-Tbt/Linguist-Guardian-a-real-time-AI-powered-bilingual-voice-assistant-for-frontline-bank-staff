/**
 * DocumentUpload â€” AI-powered document verification via image upload.
 *
 * Workflow:
 *   1. Staff selects document type (Aadhaar / PAN)
 *   2. Staff uploads a document image (drag-and-drop or click)
 *   3. AI Vision extracts name, number, DOB from the image
 *   4. Extracted data is matched against the bank's records
 *      using Jaro-Winkler + Levenshtein similarity
 *   5. Verification result is displayed with field-by-field scores
 */

import { useState, useRef } from 'react';
import { verifyDocumentUpload } from '../services/api';

const STATUS_CONFIG = {
  verified: { icon: 'âœ…', label: 'Verified', color: 'emerald', desc: 'All fields match database records.' },
  needs_review: { icon: 'âš ï¸', label: 'Needs Review', color: 'amber', desc: 'Partial match â€” some fields need manual review.' },
  not_verified: { icon: 'âŒ', label: 'Not Verified', color: 'red', desc: 'Document data does not match any records.' },
  not_found: { icon: 'ðŸ”', label: 'No Match Found', color: 'red', desc: 'No matching user found in the database.' },
  rejected: { icon: 'ðŸš«', label: 'Rejected', color: 'red', desc: 'Image could not be processed.' },
};

export default function DocumentUpload() {
  const [docType, setDocType] = useState('aadhaar');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    // Validate type
    if (!f.type.startsWith('image/')) {
      setError('Please upload an image file (JPEG, PNG, or WebP).');
      return;
    }
    // Validate size (max 10MB)
    if (f.size > 10 * 1024 * 1024) {
      setError('Image too large. Max 10 MB.');
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    handleFile(f);
  };

  const handleVerify = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await verifyDocumentUpload(file, docType);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const statusInfo = result ? STATUS_CONFIG[result.status] || STATUS_CONFIG.not_verified : null;

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        ðŸ“„ Document Verification
      </h3>

      {/* Document type selector */}
      <div className="flex gap-2 mb-3">
        {['aadhaar', 'pan'].map((type) => (
          <button
            key={type}
            onClick={() => { setDocType(type); setResult(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border ${
              docType === type
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {type === 'aadhaar' ? 'ðŸªª Aadhaar' : 'ðŸ’³ PAN'}
          </button>
        ))}
      </div>

      {/* Upload zone */}
      {!file ? (
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div className="text-3xl mb-2">ðŸ“·</div>
          <p className="text-sm text-gray-400">
            Drag & drop {docType === 'aadhaar' ? 'Aadhaar' : 'PAN'} card image here
          </p>
          <p className="text-xs text-gray-500 mt-1">
            or click to browse â€¢ JPEG, PNG, WebP
          </p>
        </div>
      ) : (
        /* File selected â€” show preview + verify button */
        <div className="space-y-3">
          {/* Image preview */}
          <div className="relative rounded-xl overflow-hidden border border-gray-200">
            <img
              src={preview}
              alt="Document preview"
              className="w-full h-32 object-cover object-center"
            />
            <button
              onClick={handleReset}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-500 transition-colors"
            >
              âœ•
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <p className="text-xs text-gray-300 truncate">{file.name}</p>
              <p className="text-[10px] text-gray-500">{(file.size / 1024).toFixed(0)} KB â€¢ {docType.toUpperCase()}</p>
            </div>
          </div>

          {/* Verify button */}
          <button
            onClick={handleVerify}
            disabled={loading}
            className="btn-primary w-full text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">â³</span> Processingâ€¦ Extracting data with AI Vision
              </span>
            ) : 'ðŸ” Verify Document'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
          <p className="text-red-600">{error}</p>
          <button
            onClick={handleVerify}
            disabled={loading}
            className="mt-2 text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            ðŸ”„ Retry Verification
          </button>
        </div>
      )}

      {/* Results */}
      {result && statusInfo && (
        <div className="mt-4 space-y-3 animate-slide-up">
          {/* Status banner */}
          <div className={`p-3 rounded-lg border text-center bg-${statusInfo.color}-500/10 border-${statusInfo.color}-500/30`}
            style={{
              backgroundColor: statusInfo.color === 'emerald' ? 'rgba(16,185,129,0.1)'
                : statusInfo.color === 'amber' ? 'rgba(245,158,11,0.1)'
                : 'rgba(239,68,68,0.1)',
              borderColor: statusInfo.color === 'emerald' ? 'rgba(16,185,129,0.3)'
                : statusInfo.color === 'amber' ? 'rgba(245,158,11,0.3)'
                : 'rgba(239,68,68,0.3)',
            }}
          >
            <span className="text-lg">{statusInfo.icon}</span>
            <span className={`text-lg font-semibold ml-2 ${
              statusInfo.color === 'emerald' ? 'text-emerald-600'
              : statusInfo.color === 'amber' ? 'text-amber-600'
              : 'text-red-600'
            }`}>
              {statusInfo.label}
            </span>
            <p className="text-xs text-gray-400 mt-1">{statusInfo.desc}</p>
            {result.overall_confidence != null && (
              <p className="text-xs text-blue-600 font-mono mt-1">
                Overall Match: {(result.overall_confidence * 100).toFixed(1)}%
              </p>
            )}
          </div>

          {/* Extracted data preview */}
          {result.extraction && !result.extraction.error && (
            <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                AI Extracted Data
              </h4>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Name</span>
                  <span className="text-gray-800 font-medium">{result.extraction.extracted_name || 'â€”'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Number</span>
                  <span className="text-gray-800 font-mono text-xs">{result.extraction.extracted_number || 'â€”'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">DOB</span>
                  <span className="text-gray-800">{result.extraction.extracted_dob || 'â€”'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Quality</span>
                  <span className={`text-xs font-medium ${
                    result.extraction.quality === 'good' ? 'text-emerald-600'
                    : result.extraction.quality === 'fair' ? 'text-amber-600'
                    : 'text-red-600'
                  }`}>
                    {result.extraction.quality?.toUpperCase() || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Confidence</span>
                  <span className="text-blue-600 font-mono text-xs">
                    {((result.extraction.confidence || 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Per-field match results */}
          {result.verification?.results?.map((r, idx) => (
            <div
              key={idx}
              className={`p-2.5 rounded-lg border text-sm ${
                r.match
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700 capitalize">
                  {r.field.replace(/_/g, ' ')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">{r.method}</span>
                  <span className={`text-xs font-mono ${
                    r.match ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {(r.score * 100).toFixed(1)}%
                  </span>
                  <span>{r.match ? 'âœ“' : 'âœ—'}</span>
                </div>
              </div>
              <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
                <span>Extracted: {r.submitted}</span>
                <span>Reference: {r.reference}</span>
              </div>
            </div>
          ))}

          {/* Verify another */}
          <button
            onClick={handleReset}
            className="w-full text-xs text-blue-600 hover:text-blue-800 transition-colors py-2"
          >
            ðŸ”„ Verify Another Document
          </button>
        </div>
      )}
    </div>
  );
}


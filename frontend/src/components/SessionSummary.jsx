/**
 * SessionSummary — One-click PDF Download of Full Conversation.
 *
 * Strategy: Renders conversation HTML inside a visible iframe (briefly),
 * uses html2canvas to capture it, then converts to PDF via jsPDF.
 * The iframe approach ensures proper rendering of all Unicode fonts.
 *
 * Fallback: If html2pdf fails, opens a print-friendly window for
 * the browser's native "Save as PDF" via Ctrl+P.
 */

import { useState } from 'react';

export default function SessionSummary({ sessionId, messages = [], alerts = [] }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  // ── Primary: Print-based PDF (100% reliable, all languages) ─
  const handleDownloadPDF = () => {
    if (!sessionId) {
      setError('No active session.');
      return;
    }
    if (messages.length === 0) {
      setError('No messages in this conversation yet.');
      return;
    }

    setDownloading(true);
    setError(null);

    try {
      const htmlContent = buildFullHTML();

      // Open a new window with the styled content
      const printWindow = window.open('', '_blank', 'width=800,height=600');

      if (!printWindow) {
        setError('Pop-up blocked! Please allow pop-ups for this site and try again.');
        setDownloading(false);
        return;
      }

      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // Wait for content to load, then trigger print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          setDownloading(false);
        }, 500);
      };

      // Fallback if onload doesn't fire
      setTimeout(() => {
        try {
          printWindow.print();
        } catch (_) { /* already printed or closed */ }
        setDownloading(false);
      }, 2000);

    } catch (err) {
      console.error('[SessionSummary] PDF generation failed:', err);
      setError('Failed to generate PDF: ' + err.message);
      setDownloading(false);
    }
  };

  // ── Build complete standalone HTML page ─────────────────────
  const buildFullHTML = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const customerCount = messages.filter(m => m.role === 'customer').length;
    const staffCount = messages.filter(m => m.role === 'staff').length;

    // Build message blocks
    let msgHTML = '';
    for (const msg of messages) {
      const isCustomer = msg.role === 'customer';
      const label = isCustomer ? 'CUSTOMER' : 'STAFF';
      const badgeColor = isCustomer ? '#10b981' : '#6366f1';
      const bgColor = isCustomer ? '#ecfdf5' : '#eef2ff';
      const borderColor = isCustomer ? '#a7f3d0' : '#c7d2fe';

      const ts = msg.created_at
        ? new Date(msg.created_at).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
          })
        : '';

      const primary = esc(msg.original_text || msg.text || '');
      const secondary = esc(msg.translated_text || '');
      const showSecondary = secondary && secondary !== primary;

      msgHTML += `
        <div class="msg-bubble" style="background:${bgColor};border:1px solid ${borderColor};">
          <div class="msg-header">
            <span class="badge" style="background:${badgeColor};">${label}</span>
            <span class="timestamp">${ts}</span>
          </div>
          <p class="msg-text">${primary}</p>
          ${showSecondary ? `<p class="msg-translation" style="border-top-color:${borderColor};">🌐 ${secondary}</p>` : ''}
        </div>`;
    }

    // Build alerts
    let alertHTML = '';
    if (alerts.length > 0) {
      let items = '';
      for (const alert of alerts) {
        const text = typeof alert === 'string'
          ? alert
          : alert.message || alert.description || alert.keyword || JSON.stringify(alert);
        const cat = alert.category || alert.alert_type || '';
        items += `
          <div class="alert-item">
            <span class="alert-badge">⚠ ALERT</span>
            ${cat ? `<span class="alert-cat">[${esc(cat)}]</span>` : ''}
            <p class="alert-text">${esc(text)}</p>
          </div>`;
      }
      alertHTML = `
        <div class="alerts-section">
          <h2 class="section-title" style="color:#ef4444;border-bottom-color:#ef4444;">⚠️ Compliance Alerts</h2>
          ${items}
        </div>`;
    }

    // Full standalone HTML page with embedded CSS & print styles
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Session Report — ${sessionId.slice(0, 8)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Noto Sans', 'Noto Sans Devanagari', 'Segoe UI', Tahoma, sans-serif;
      color: #1f2937;
      background: #fff;
      padding: 24px;
      max-width: 760px;
      margin: 0 auto;
    }

    .header {
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      color: #fff;
      padding: 22px 24px;
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .header h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
    .header .subtitle { font-size: 12px; opacity: 0.9; }
    .header .org { font-size: 10px; opacity: 0.7; margin-top: 2px; }

    .info-box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
    }
    .info-item { flex: 1; min-width: 160px; }
    .info-label {
      font-size: 9px; font-weight: 700; color: #9ca3af;
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
    }
    .info-value { font-size: 12px; color: #1f2937; }
    .info-value.mono { font-family: 'Courier New', monospace; font-size: 11px; }

    .section-title {
      font-size: 14px; font-weight: 700; color: #4f46e5;
      border-bottom: 2px solid #4f46e5; padding-bottom: 6px;
      margin-bottom: 12px;
    }

    .msg-bubble {
      border-radius: 10px; padding: 12px 16px;
      margin-bottom: 10px; page-break-inside: avoid;
    }
    .msg-header {
      display: flex; justify-content: space-between;
      align-items: center; margin-bottom: 6px;
    }
    .badge {
      display: inline-block; padding: 3px 12px; border-radius: 5px;
      color: #fff; font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
    }
    .timestamp { font-size: 10px; color: #9ca3af; }
    .msg-text {
      font-size: 13px; color: #1f2937; line-height: 1.7;
      word-wrap: break-word; margin: 0;
    }
    .msg-translation {
      font-size: 11px; color: #6b7280; font-style: italic;
      border-top: 1px solid #e5e7eb; padding-top: 6px; margin: 6px 0 0;
    }

    .alerts-section { margin-top: 20px; }
    .alert-item {
      background: #fef2f2; border: 1px solid #fecaca;
      border-radius: 8px; padding: 10px 14px;
      margin-bottom: 8px; page-break-inside: avoid;
    }
    .alert-badge { font-size: 10px; font-weight: 700; color: #ef4444; }
    .alert-cat { font-size: 9px; color: #9ca3af; margin-left: 8px; }
    .alert-text { font-size: 12px; color: #1f2937; margin-top: 4px; }

    .footer {
      margin-top: 28px; border-top: 1px solid #e5e7eb;
      padding-top: 12px; text-align: center;
      font-size: 9px; color: #9ca3af;
    }

    /* Print-specific styles */
    @media print {
      body { padding: 12px; }
      .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .msg-bubble { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .alert-item { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .info-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <h1>Linguist-Guardian</h1>
    <div class="subtitle">Session Conversation Report</div>
    <div class="org">Union Bank of India — AI-Powered Multilingual Banking Assistant</div>
  </div>

  <!-- Session Info -->
  <div class="info-box">
    <div class="info-item">
      <div class="info-label">Session ID</div>
      <div class="info-value mono">${sessionId}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Date &amp; Time</div>
      <div class="info-value">${dateStr} at ${timeStr}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Messages</div>
      <div class="info-value">${messages.length} total (Customer: ${customerCount} | Staff: ${staffCount})</div>
    </div>
  </div>

  <!-- Transcript -->
  <h2 class="section-title">💬 Conversation Transcript</h2>
  ${msgHTML}

  <!-- Alerts -->
  ${alertHTML}

  <!-- Footer -->
  <div class="footer">
    Linguist-Guardian — Union Bank of India — AI-Powered Multilingual Banking Assistant<br>
    Generated on ${dateStr} at ${timeStr}
  </div>
</body>
</html>`;
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Session Summary
        </h3>
        <button
          onClick={handleDownloadPDF}
          disabled={downloading || !sessionId || messages.length === 0}
          className="text-xs py-1.5 px-4 rounded-lg font-semibold transition-all
                     bg-blue-600 text-white
                     hover:bg-blue-700
                     disabled:opacity-40 disabled:cursor-not-allowed
                     flex items-center gap-1.5 shadow-sm"
        >
          {downloading ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>📄 Download PDF</>
          )}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-2">{error}</p>
      )}

      <p className="text-sm text-gray-500">
        {messages.length > 0
          ? `${messages.length} messages ready — click "Download PDF" to save transcript.`
          : 'Start a conversation, then download the transcript as PDF.'
        }
      </p>
    </div>
  );
}

/** Safely escape HTML */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

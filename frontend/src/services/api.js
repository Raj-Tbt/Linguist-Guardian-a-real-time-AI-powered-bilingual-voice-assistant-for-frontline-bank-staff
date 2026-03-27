/**
 * Linguist-Guardian â€” REST API Client.
 *
 * Provides typed helper functions for all backend endpoints.
 * Base URL is relative (Vite proxy routes /api â†’ backend).
 */

const BASE_URL = `http://${window.location.hostname}:8000/api`;

/**
 * Generic fetch wrapper with JSON parsing and error handling.
 */
async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Request failed: ${res.status}`);
  }

  return res.json();
}

// â”€â”€ Sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function createSession(data) {
  return request('/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listSessions() {
  return request('/sessions');
}

export async function listActiveSessions() {
  return request('/sessions/active');
}

export async function joinSession(sessionId, data) {
  return request(`/sessions/${sessionId}/join`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getSession(sessionId) {
  return request(`/sessions/${sessionId}`);
}

export async function endSession(sessionId) {
  return request(`/sessions/${sessionId}/end`, { method: 'POST' });
}

// â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getMessages(sessionId) {
  return request(`/sessions/${sessionId}/messages`);
}

export async function addMessage(sessionId, data) {
  return request(`/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// â”€â”€ Compliance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function checkCompliance(sessionId, text) {
  return request(`/sessions/${sessionId}/compliance-check`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function getComplianceAlerts(sessionId) {
  return request(`/sessions/${sessionId}/compliance-alerts`);
}

// â”€â”€ Document Verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function verifyDocument(data) {
  return request('/verify-document', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function verifyDocumentUpload(file, documentType = 'aadhaar') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_type', documentType);

  const url = `${BASE_URL}/verify-document-upload`;
  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    // Don't set Content-Type â€” browser sets multipart boundary automatically
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Upload failed: ${res.status}`);
  }

  return res.json();
}

// â”€â”€ FSM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getFSMState(sessionId) {
  return request(`/sessions/${sessionId}/fsm-state`);
}

export async function advanceFSM(sessionId, targetState) {
  return request(`/sessions/${sessionId}/fsm-advance`, {
    method: 'POST',
    body: JSON.stringify({ target_state: targetState }),
  });
}

// â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function generateSummary(sessionId) {
  return request(`/sessions/${sessionId}/summary`, {
    method: 'POST',
  });
}

// â”€â”€ GenAI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function processText(text, targetLanguage = null) {
  const params = new URLSearchParams({ text });
  if (targetLanguage) params.append('target_language', targetLanguage);
  return request(`/genai/process?${params}`, { method: 'POST' });
}

// â”€â”€ Voice Response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function getVoiceResponse(intent = 'general_query', language = 'en') {
  const params = new URLSearchParams({ intent, language });
  return request(`/voice-response?${params}`, { method: 'POST' });
}

// â”€â”€ Fake Users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function listFakeUsers() {
  return request('/fake-users');
}

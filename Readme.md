# 🏛️ Linguist-Guardian — Real-Time GenAI Banking Assistant

> A production-ready, bilingual AI assistant for frontline bank staff at Union Bank of India. Combines real-time voice processing, intelligent translation, compliance monitoring, and process automation.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎙️ **Real-Time Audio** | Microphone capture → WebSocket streaming → continuous processing |
| 🗣️ **Speech-to-Text** | Whisper-based transcription (mock + API modes) |
| 🌐 **GenAI Orchestrator** | Intent detection + bilingual translation (GPT-4o / mock) |
| 📋 **FSM Process Engine** | Account Opening & Loan Inquiry with step-skipping prevention |
| 🛡️ **Compliance Engine** | BM25 keyword detection + semantic similarity (ChromaDB) |
| 📄 **Document Verification** | Levenshtein (doc numbers), Jaro-Winkler (names), exact match (DOB) |
| 🔊 **Voice Response** | TTS mock with bilingual canned responses |
| 📝 **Bilingual Summary** | TextRank with SentenceTransformer embeddings |
| 💾 **Database** | Sessions, messages, compliance alerts, summaries (SQLite / PostgreSQL) |
| 🐳 **Docker Ready** | One-command deployment with docker-compose |

---

## 📁 Project Structure

```
backend/
  app/
    main.py                  # FastAPI entry point
    api/routes.py            # REST API endpoints
    websocket/handler.py     # WebSocket real-time handler
    core/
      config.py              # Pydantic settings
      logging.py             # Structured logger
    services/
      genai_orchestrator.py  # Intent + translation (GPT-4o / mock)
      fsm_engine.py          # Finite state machine
      compliance_engine.py   # BM25 + semantic checks
      document_verification.py # Levenshtein + Jaro-Winkler
      speech_to_text.py      # Whisper STT
      summary_service.py     # TextRank bilingual summary
      voice_response.py      # TTS mock
    models/models.py         # SQLAlchemy ORM models
    schemas/schemas.py       # Pydantic schemas
    db/
      database.py            # Async engine + session
      seed.py                # 20 fake Indian users
  requirements.txt
  .env

frontend/
  src/
    App.jsx                  # Router + landing page
    pages/
      StaffDashboard.jsx     # Full staff dashboard
      CustomerDashboard.jsx  # Customer voice interface
    components/
      ChatPanel.jsx          # Bilingual chat display
      ComplianceAlerts.jsx   # Compliance violation panel
      FSMTracker.jsx         # Process step tracker
      DocumentUpload.jsx     # Document verification form
      SessionSummary.jsx     # Bilingual summary display
    hooks/
      useWebSocket.js        # WS connection with reconnect
      useAudioCapture.js     # MediaRecorder chunked streaming
    services/
      api.js                 # REST API client
  package.json
  vite.config.js
  tailwind.config.js

docker/
  Dockerfile.backend
  Dockerfile.frontend
  docker-compose.yml
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **npm** or **yarn**

### 1. Backend Setup

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Linux/Mac)
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload --port 8000
```

The backend will:
- Create SQLite database automatically
- Seed 20 fake users for document verification
- Serve API at `http://localhost:8000`
- Serve API docs at `http://localhost:8000/docs`

### 2. Frontend Setup

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 🐳 Docker Deployment

```bash
cd docker

# Start all services (PostgreSQL + Backend + Frontend)
docker-compose up --build

# Access:
#   Frontend: http://localhost:80
#   Backend:  http://localhost:8000
#   API Docs: http://localhost:8000/docs
```

To use real OpenAI (optional):
```bash
OPENAI_API_KEY=sk-xxx docker-compose up --build
```

---

## 📡 API Examples

### Create a Session

```bash
curl -X POST http://localhost:8000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Rajesh",
    "staff_name": "Agent",
    "language": "hi",
    "process_type": "account_opening"
  }'
```

### Send a Message (with auto-translation + intent)

```bash
curl -X POST http://localhost:8000/api/sessions/{session_id}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "role": "customer",
    "original_text": "मुझे लोन चाहिए",
    "language": "hi"
  }'
```

### Check Compliance

```bash
curl -X POST http://localhost:8000/api/sessions/{session_id}/compliance-check \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I can guarantee you will get approved with no risk"
  }'
```

### Verify Document

```bash
curl -X POST http://localhost:8000/api/verify-document \
  -H "Content-Type: application/json" \
  -d '{
    "document_type": "aadhaar",
    "extracted_name": "Rajesh Kumar Sharma",
    "extracted_number": "234567890123",
    "extracted_dob": "15/03/1985"
  }'
```

### Advance FSM

```bash
curl -X POST http://localhost:8000/api/sessions/{session_id}/fsm-advance \
  -H "Content-Type: application/json" \
  -d '{"target_state": "kyc_submission"}'
```

### Generate Summary

```bash
curl -X POST http://localhost:8000/api/sessions/{session_id}/summary
```

### GenAI Process (standalone)

```bash
curl -X POST "http://localhost:8000/api/genai/process?text=I%20want%20a%20loan"
```

---

## 🔌 WebSocket Usage

Connect to: `ws://localhost:8000/ws/{session_id}`

### Send text message:
```json
{
  "type": "text_input",
  "data": {
    "text": "मुझे नया खाता खोलना है",
    "role": "customer",
    "language": "hi"
  }
}
```

### Start a process:
```json
{
  "type": "start_process",
  "data": { "process_type": "account_opening" }
}
```

### Advance FSM:
```json
{
  "type": "advance_fsm",
  "data": { "target_state": "kyc_submission" }
}
```

### Send audio (binary):
Send raw audio bytes (webm/opus) directly over the WebSocket.

### Response message types:
| Type | Description |
|------|-------------|
| `connected` | Connection confirmation |
| `transcription` | STT result |
| `translation` | Intent + translated text |
| `compliance` | Violation alerts |
| `fsm_update` | FSM state change |
| `voice_response` | Bot response text |
| `error` | Error message |

---

## 🔧 Configuration

All settings via `.env` file (or environment variables):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./linguist_guardian.db` | Database connection string |
| `OPENAI_API_KEY` | *(empty)* | Set for real GPT-4o + Whisper |
| `WHISPER_MODE` | `mock` | `mock` or `api` |
| `HOST` | `0.0.0.0` | Server bind address |
| `PORT` | `8000` | Server port |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed origins |

---

## 🧪 Fake Dataset

20 sample Indian users are auto-seeded on startup. Example:

| Name | PAN | Aadhaar | DOB |
|------|-----|---------|-----|
| Rajesh Kumar Sharma | ABCPS1234K | 234567890123 | 15/03/1985 |
| Priya Devi Singh | BDFPS5678L | 345678901234 | 22/07/1990 |
| Amit Kumar Verma | CDGPV9012M | 456789012345 | 08/11/1988 |

Full list available at `GET /api/fake-users`.

---

## 📜 License

MIT © 2025 Linguist-Guardian
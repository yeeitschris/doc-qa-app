import { useState } from 'react'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000'

function App() {
  const [file, setFile] = useState(null)
  const [uploadInfo, setUploadInfo] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [contextChunks, setContextChunks] = useState([])
  const [showContext, setShowContext] = useState(false)
  const [askError, setAskError] = useState('')
  const [asking, setAsking] = useState(false)

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setUploadError('')
    setUploadInfo(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Upload failed (${res.status})`)
      }

      const data = await res.json()
      setUploadInfo(data)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleAsk = async () => {
    if (!question.trim()) return

    setAsking(true)
    setAskError('')
    setAnswer('')
    setContextChunks([])

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail || `Request failed (${res.status})`)
      }

      const data = await res.json()
      setAnswer(data.answer)
      setContextChunks(data.chunks || [])
    } catch (err) {
      setAskError(err.message)
    } finally {
      setAsking(false)
    }
  }

  return (
    <main className="app">
      <h1>Document Q&A</h1>

      <section className="card">
        <h2>1. Upload a document</h2>
        <div className="row">
          <input
            type="file"
            accept=".txt"
            onChange={(e) => setFile(e.target.files[0] || null)}
          />
          <button onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>

        {uploadInfo && (
          <p className="success">
            Uploaded <strong>{uploadInfo.filename}</strong> — {uploadInfo.num_chunks} chunk
            {uploadInfo.num_chunks === 1 ? '' : 's'} added ({uploadInfo.total_chunks} total).
          </p>
        )}
        {uploadError && <p className="error">{uploadError}</p>}
      </section>

      <section className="card">
        <h2>2. Ask a question</h2>
        <div className="row">
          <input
            type="text"
            placeholder="What would you like to know?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!uploadInfo}
          />
          <button onClick={handleAsk} disabled={!uploadInfo || !question.trim() || asking}>
            {asking ? 'Asking…' : 'Ask'}
          </button>
        </div>
        {!uploadInfo && <p className="hint">Upload a document before asking a question.</p>}
        {askError && <p className="error">{askError}</p>}
      </section>

      {asking && <p className="loading">Thinking…</p>}

      {answer && (
        <section className="card answer-card">
          <h2>Answer</h2>
          <p className="answer">{answer}</p>

          <button className="toggle" onClick={() => setShowContext((v) => !v)}>
            {showContext ? '▼' : '▶'} Context used ({contextChunks.length})
          </button>

          {showContext && (
            <ul className="chunks">
              {contextChunks.map((chunk, i) => (
                <li key={i}>{chunk}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}

export default App

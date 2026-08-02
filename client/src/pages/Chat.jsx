import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import './Chat.css'
import socket from "../services/socket";
function Chat() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am Jarvis. How can I assist you today?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const bottomRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const autoModeRef = useRef(false)
  const abortControllerRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  useEffect(() => {
  socket.connect();
 

  socket.on('jarvis_wake', (data) => {
    console.log('Wake event:', data)

    if (data.trigger === 'wake_word' || data.trigger === 'double_clap') {
      // Show activation in chat
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Yes sir, I'm listening..."
      }])
    }

    if (data.message) {
      // Show user message from wake service
      setMessages(prev => [...prev, {
        role: 'user',
        content: data.message
      }])
    }

    if (data.reply) {
      // Show Jarvis reply from wake service
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply
      }])
    }
  })

  return () => {
  socket.off("jarvis_wake");
};
}, [])
  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
  ? 'audio/webm;codecs=opus' 
  : 'audio/webm'
const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' })
        await transcribeAudio(audioBlob)
      }

      mediaRecorder.start()
      setListening(true)
    } catch (error) {
      console.error('Mic error:', error)
      alert('Microphone access denied. Please allow mic access!')
    }
  }

  const stopListening = () => {
    if (mediaRecorderRef.current && listening) {
      mediaRecorderRef.current.stop()
      setListening(false)
    }
  }

  const transcribeAudio = async (audioBlob) => {
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.wav')

      const res = await axios.post('http://localhost:5000/api/chat/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const text = res.data.text
      if (text && text.trim()) {
        setInput(text)
        await sendMessageWithText(text)
      }
    } catch (error) {
      console.error('Transcription error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I could not transcribe that. Please try again.'
      }])
    }
  }

  const handleMicClick = () => {
    if (listening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const toggleAutoMode = () => {
   
  }

  const stopSpeaking = async () => {
    try {
      await axios.post('http://127.0.0.1:5001/stop')
    } catch {}
  }

  const cancelThinking = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setLoading(false)
    stopSpeaking()
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Cancelled. What else can I help you with?'
    }])
    if (autoModeRef.current) {
      setTimeout(() => startListening(), 500)
    }
  }

  const sendMessageWithText = async (text) => {
    if (!text.trim()) return

    const userMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    const history = updatedMessages.slice(0, -1).map(m => ({
      role: m.role,
      content: m.content
    }))

    abortControllerRef.current = new AbortController()

    try {
      const res = await axios.post('http://localhost:5000/api/chat', {
        message: text,
        history
      }, {
        signal: abortControllerRef.current.signal
      })

      const reply = res.data.reply;
      await axios.post("http://localhost:5000/api/memory/save", {
    type: "conversation",
    content: `User: ${text}\nJarvis: ${reply}`
});
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])

      
    } catch (error) {
      if (axios.isCancel(error) || error.name === 'CanceledError') {
        return
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error connecting to Jarvis server.'
      }])
    }
    setLoading(false)
    abortControllerRef.current = null
  }

  const sendMessage = () => {
    sendMessageWithText(input)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') sendMessage()
  }

return (
  <div className="chat-container">

    <div className="chat-messages">
      {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <span className="label">{m.role === 'assistant' ? 'JARVIS' : 'YOU'}</span>
            <p>{m.content}</p>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <span className="label">JARVIS</span>
            <div className="thinking-box">

    <span className="thinking-label">JARVIS</span>

    <div className="thinking-dots">
        <span></span>
        <span></span>
        <span></span>
    </div>

    <button className="cancel-btn" onClick={cancelThinking}>
        ✕ Cancel
    </button>

</div>
          </div>
        )}
        <div ref={bottomRef} />
    </div>

    <div className="chat-input">
        <button
          className={`mode-button ${autoMode ? 'active' : ''}`}
          onClick={toggleAutoMode}
          title="Toggle hands-free mode"
        >
          {autoMode ? '🔴 LIVE' : '💬 MANUAL'}
        </button>
        <button
          className={`mic-button ${listening ? 'listening' : ''}`}
          onClick={handleMicClick}
          title={listening ? 'Click to stop recording' : 'Click to start recording'}
        >
          {listening ? '⏹️' : '🎤'}
        </button>
        <button
          className="mic-button"
          onClick={stopSpeaking}
          title="Stop Jarvis speaking"
        >
          🔇
        </button>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={listening ? '🔴 Recording... click ⏹️ to stop' : 'Talk to Jarvis...'}
        />
        <button onClick={sendMessage}>SEND</button>

    </div>

  </div>
);}

export default Chat;
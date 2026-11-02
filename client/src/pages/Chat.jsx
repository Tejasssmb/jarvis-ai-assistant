import { useState, useRef, useEffect } from 'react'
import axios from 'axios'
import './Chat.css'
import ConversationSidebar from "../components/ConversationSidebar";
import { useVoice } from "../context/VoiceContext";
import MessageContent, { hasCode } from "../components/MessageContent";
function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const bottomRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const autoModeRef = useRef(false)
  const abortControllerRef = useRef(null)
  const [conversationId, setConversationId] = useState(null);
  const startupLoaded = useRef(false);
  const [jarvisState, setJarvisState] =
  useState("idle");
  const voice = useVoice();
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
 useEffect(() => {

  if (startupLoaded.current) {
    return;
  }

  startupLoaded.current = true;

  loadStartupBriefing();

}, []);
 
  // Messages coming from the voice loop ("Hey Jarvis" conversations, reminders).
  // Anything said while this page was closed (e.g. the code you asked for) is
  // fetched from the server first, then new ones arrive live.
  useEffect(() => {
    let cancelled = false
    const seen = Number(localStorage.getItem('voiceFeedSeen') || 0)

    voice.fetchFeed(seen).then(items => {
      if (cancelled || !items.length) return
      setMessages(prev => [
        ...prev,
        ...items.map(i => ({ role: i.role, content: i.content }))
      ])
      localStorage.setItem('voiceFeedSeen', String(Math.max(...items.map(i => i.ts))))
    })

    const unsubscribe = voice.subscribe((data) => {
      if (data.message) {
        setMessages(prev => [...prev, { role: 'user', content: data.message }])
      }
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }
      if (data.message || data.reply) {
        localStorage.setItem('voiceFeedSeen', String(Date.now()))
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [voice.subscribe, voice.fetchFeed])

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
      setJarvisState("listening");
    } catch (error) {
      console.error('Mic error:', error)
      alert('Microphone access denied. Please allow mic access!')
    }
  }

  const stopListening = () => {
    if (mediaRecorderRef.current && listening) {
      mediaRecorderRef.current.stop()
      setListening(false)
      setJarvisState("idle");
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
    voice.setLiveMode(!voice.live)
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
  const loadConversation = async (id) => {
  try {
    console.log("CLICKED ID:", id);

    const res = await axios.get(
      `http://localhost:5000/api/conversations/${id}`
    );

    console.log("FULL RESPONSE:", res.data);
    console.log("MESSAGES:", res.data.messages);

    setConversationId(id);
    setMessages(res.data.messages || []);

  } catch (err) {
    console.error(err);
  }
};
 
  // Speaks text through the voice service. /speak blocks until the audio
  // has FINISHED playing, so awaiting it tells us exactly when Jarvis is done.
  const speakAloud = async (text) => {
    if (!text) return
    try {
      await axios.post('http://127.0.0.1:5001/speak', { text })
    } catch (err) {
      console.error('Speak failed:', err)
    }
  }

  const sendMessageWithText = async (text) => {
    if (!text.trim()) return

    const userMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setJarvisState("thinking");
    const history = updatedMessages.slice(0, -1).map(m => ({
      role: m.role,
      content: m.content
    }))

    abortControllerRef.current = new AbortController()

    try {
      if (conversationId) {
        axios.post(
          `http://localhost:5000/api/conversations/${conversationId}/message`,
          { role: "user", content: text }
        ).catch(console.error)
      }

      // speak:false -> the server returns the full reply plus a short "speech"
      // version; we speak it here so we know exactly when Jarvis stops talking.
      const res = await axios.post('http://localhost:5000/api/chat', {
        message: text,
        history,
        speak: false
      }, {
        signal: abortControllerRef.current.signal
      })

      const reply = res.data.reply;
      const imageUrl = res.data.imageUrl;

      // show the reply immediately, save to the database in the background
      setMessages(prev => [...prev, { role: 'assistant', content: reply, imageUrl }])
      setLoading(false)
      abortControllerRef.current = null

      Promise.allSettled([
        axios.post("http://localhost:5000/api/memory/save", {
          type: "conversation",
          content: `User: ${text}\nJarvis: ${reply}`
        }),
        conversationId
          ? axios.post(
              `http://localhost:5000/api/conversations/${conversationId}/message`,
              { role: "assistant", content: reply, imageUrl }
            )
          : null
      ])

      setJarvisState("speaking");
      await speakAloud(res.data.speech)
      setJarvisState("idle");

    } catch (error) {
      if (axios.isCancel(error) || error.name === 'CanceledError') {
        return
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error connecting to Jarvis server.'
      }])
      setLoading(false)
      setJarvisState("idle");
      abortControllerRef.current = null
    }
  }

  // The greeting is SPOKEN by the voice loop when you say "Hey Jarvis".
  // Here we only show it as the first chat message.
  const loadStartupBriefing = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/startup");
      setMessages(prev => [
        { role: "assistant", content: res.data.briefing },
        ...prev
      ]);
    } catch (err) {
      console.error("Startup briefing failed", err);
    }
  };

  const sendMessage = () => {
    sendMessageWithText(input)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') sendMessage()
  }
return (
  <div className="chat-container">
    <div className="chat-body">
    {/* LEFT SIDE */}
    <ConversationSidebar
      onSelectConversation={loadConversation}
    />
     {/* RIGHT SIDE */}
    
    <div className="chat-messages">
  {messages.map((m, i) => (
    <div key={i} className={`message ${m.role}${hasCode(m.content) ? ' has-code' : ''}`}>
      <span className="label">
        {m.role === 'assistant' ? 'JARVIS' : 'YOU'}
      </span>

      <MessageContent text={m.content} role={m.role} />

      {m.imageUrl && (
        <img
          src={`http://localhost:5000${m.imageUrl}`}
          alt="Screenshot"
          style={{
            maxWidth: "100%",
            marginTop: "10px",
            borderRadius: "10px"
          }}
        />
      )}
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

  </div>

    <div className="chat-input">
        <button
          className={`mode-button ${voice.live ? 'active' : ''}`}
          onClick={toggleAutoMode}
          title="Toggle hands-free mode"
        >
          {voice.live ? '🔴 LIVE' : '💬 MANUAL'}
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
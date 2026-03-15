/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Send, User, LogOut, SkipForward, ShieldAlert, MessageSquare, ArrowLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Filter } from 'bad-words';

const filter = new Filter();

const Logo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={`${className} relative group`}>
    <motion.div
      animate={{ 
        rotate: [0, 5, -5, 0],
        scale: [1, 1.02, 0.98, 1]
      }}
      transition={{ 
        repeat: Infinity, 
        duration: 4,
        ease: "easeInOut"
      }}
      className="absolute inset-0 bg-gradient-to-tr from-orange-600 to-orange-400 rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity"
    />
    <div className="relative h-full w-full bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg border border-white/20 overflow-hidden">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2/3 h-2/3 text-white drop-shadow-md">
        <path 
          d="M17 8C17 10.2091 15.2091 12 13 12C10.7909 12 9 10.2091 9 8C9 5.79086 10.7909 4 13 4C15.2091 4 17 5.79086 17 8Z" 
          fill="currentColor" 
          fillOpacity="0.9"
        />
        <path 
          d="M3 15C3 13.3431 4.34315 12 6 12H10C11.6569 12 13 13.3431 13 15V16C13 18.2091 11.2091 20 9 20H7C4.79086 20 3 18.2091 3 16V15Z" 
          fill="currentColor"
        />
        <path 
          d="M16 14C16 12.8954 16.8954 12 18 12H20C21.1046 12 22 12.8954 22 14V15C22 16.6569 20.6569 18 19 18H18C16.8954 18 16 17.1046 16 16V14Z" 
          fill="currentColor" 
          fillOpacity="0.6"
        />
      </svg>
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
    </div>
  </div>
);

interface Message {
  id: string;
  text: string;
  sender: 'me' | 'stranger' | 'system';
  timestamp: number;
}

type View = 'chat' | 'terms' | 'privacy' | 'guidelines';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('chat');
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState<'idle' | 'searching' | 'connected'>('idle');
  const [partnerName, setPartnerName] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isPartnerTyping]);

  const connectWebSocket = (name: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', username: name }));
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'searching':
          setStatus('searching');
          setPartnerName('');
          setIsPartnerTyping(false);
          setMessages([{
            id: Date.now().toString(),
            text: 'Searching for a stranger...',
            sender: 'system',
            timestamp: Date.now()
          }]);
          break;

        case 'match':
          setStatus('connected');
          setPartnerName(data.partnerName);
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            text: `You are now connected to ${data.partnerName}.`,
            sender: 'system',
            timestamp: Date.now()
          }]);
          break;

        case 'chat':
          if (!isBlocked) {
            setIsPartnerTyping(false);
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              text: data.text,
              sender: 'stranger',
              timestamp: Date.now()
            }]);
          }
          break;

        case 'typing':
          if (!isBlocked) {
            setIsPartnerTyping(data.isTyping);
          }
          break;

        case 'partner_disconnected':
          setStatus('searching');
          setPartnerName('');
          setIsPartnerTyping(false);
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            text: 'Stranger has left the chat.',
            sender: 'system',
            timestamp: Date.now()
          }]);
          break;
      }
    };

    socket.onclose = () => {
      if (isJoined) {
        setStatus('idle');
      }
    };
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsJoined(true);
      connectWebSocket(username);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    if (socketRef.current && status === 'connected') {
      socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: true }));
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      typingTimeoutRef.current = setTimeout(() => {
        if (socketRef.current) {
          socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: false }));
        }
      }, 2000);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && socketRef.current && status === 'connected') {
      const cleanText = filter.clean(inputText);
      socketRef.current.send(JSON.stringify({ type: 'chat', text: cleanText }));
      socketRef.current.send(JSON.stringify({ type: 'typing', isTyping: false }));
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: cleanText,
        sender: 'me',
        timestamp: Date.now()
      }]);
      setInputText('');
    }
  };

  const handleSkip = () => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: 'skip' }));
      setMessages([]);
      setStatus('searching');
      setIsBlocked(false);
      setIsPartnerTyping(false);
    }
  };

  const handleBlock = () => {
    setIsBlocked(true);
    setIsPartnerTyping(false);
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: 'You have blocked this stranger. You will no longer receive their messages.',
      sender: 'system',
      timestamp: Date.now()
    }]);
  };

  const LegalFooter = () => (
    <footer className="py-6 px-4 text-center border-t border-zinc-800/50 mt-auto">
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
        <button onClick={() => setCurrentView('terms')} className="hover:text-orange-500 transition-colors">Terms & Conditions</button>
        <button onClick={() => setCurrentView('privacy')} className="hover:text-orange-500 transition-colors">Privacy Policy</button>
        <button onClick={() => setCurrentView('guidelines')} className="hover:text-orange-500 transition-colors">Community Guidelines</button>
      </div>
      <p className="mt-4 text-[9px] text-zinc-700 uppercase tracking-tighter">© 2026 StrangerChat. All rights reserved.</p>
    </footer>
  );

  const LegalPage = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-sans p-6 md:p-12 overflow-y-auto">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={() => setCurrentView('chat')}
          className="flex items-center gap-2 text-orange-500 font-bold uppercase tracking-widest text-xs mb-8 hover:gap-3 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Chat
        </button>
        <h1 className="text-3xl font-black text-white tracking-tighter mb-8 border-b border-zinc-800 pb-4">{title}</h1>
        <div className="space-y-6 text-sm leading-relaxed">
          {children}
        </div>
        <div className="mt-12 pt-8 border-t border-zinc-800 text-center">
          <button 
            onClick={() => setCurrentView('chat')}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-3 rounded-xl font-bold transition-all"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );

  if (currentView === 'terms') {
    return (
      <LegalPage title="Terms and Conditions – StrangerChat">
        <p>By using this website, you agree to the following terms:</p>
        <ul className="list-disc pl-5 space-y-3">
          <li>Users must be at least 18 years old to use this platform.</li>
          <li>StrangerChat provides anonymous chat between users and does not verify identities.</li>
          <li>Users are fully responsible for the messages they send.</li>
          <li>The platform owner is not responsible for user-generated content.</li>
          <li>The following are strictly prohibited:
            <ul className="list-circle pl-5 mt-2 space-y-1 opacity-80">
              <li>Harassment or bullying</li>
              <li>Hate speech</li>
              <li>Illegal activities</li>
              <li>Sexual exploitation or explicit content involving minors</li>
              <li>Spam or scams</li>
            </ul>
          </li>
          <li>The platform may disconnect or block users who violate these rules.</li>
          <li>Chats are temporary and are not stored after a session ends.</li>
          <li>These terms may be updated at any time without prior notice.</li>
        </ul>
      </LegalPage>
    );
  }

  if (currentView === 'privacy') {
    return (
      <LegalPage title="Privacy Policy – StrangerChat">
        <ul className="list-disc pl-5 space-y-3">
          <li>This website does not require account creation.</li>
          <li>Only temporary connection data may be used to match users for chat.</li>
          <li>Messages exchanged between users are not permanently stored.</li>
          <li>Once a chat session ends, messages are deleted.</li>
          <li>The website may use cookies for basic functionality.</li>
          <li>Third-party advertising services may use cookies if ads are displayed.</li>
          <li>This platform is not intended for users under 18 years of age.</li>
          <li>We take reasonable steps to protect user data but cannot guarantee complete security.</li>
        </ul>
      </LegalPage>
    );
  }

  if (currentView === 'guidelines') {
    return (
      <LegalPage title="Community Guidelines – StrangerChat">
        <ul className="list-disc pl-5 space-y-3">
          <li>Treat other users with respect.</li>
          <li>Do not share personal information such as phone numbers, addresses, or passwords.</li>
          <li>Do not send explicit, illegal, or harmful content.</li>
          <li>Do not harass, threaten, or bully other users.</li>
          <li>If you feel uncomfortable, use the “Next Stranger” button.</li>
          <li>Users who violate these rules may be disconnected or blocked.</li>
        </ul>
      </LegalPage>
    );
  }

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-500/10 blur-[120px] rounded-full" />
        
        <div className="flex-1 flex items-center justify-center w-full">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 shadow-2xl relative z-10"
          >
            <div className="flex flex-col items-center mb-8">
              <motion.div 
                whileHover={{ scale: 1.05, rotate: 5 }}
                className="mb-6"
              >
                <Logo className="w-20 h-20" />
              </motion.div>
              <h1 className="text-4xl font-black text-white tracking-tighter">StrangerChat</h1>
              <p className="text-zinc-400 mt-3 text-center font-medium">Connect with the world, one stranger at a time.</p>
            </div>

            <form onSubmit={handleJoin} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3 ml-1">
                  Choose a Nickname
                </label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. CoolCat"
                    className="w-full bg-zinc-800/50 border border-zinc-700 text-white rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-all placeholder:text-zinc-600"
                    maxLength={20}
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-orange-500/25 active:scale-[0.97] text-lg tracking-tight"
              >
                Start Chatting
              </button>
            </form>

            <div className="mt-10 pt-6 border-t border-zinc-800/50 text-center">
              <div className="flex items-center justify-center gap-4 text-zinc-500 mb-4">
                <div className="flex flex-col items-center">
                  <span className="text-white font-bold text-lg">100%</span>
                  <span className="text-[10px] uppercase tracking-widest">Anonymous</span>
                </div>
                <div className="w-px h-8 bg-zinc-800" />
                <div className="flex flex-col items-center">
                  <span className="text-white font-bold text-lg">Instant</span>
                  <span className="text-[10px] uppercase tracking-widest">Matching</span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-600 font-medium">
                By entering, you agree to our community standards.
              </p>
            </div>
          </motion.div>
        </div>

        <LegalFooter />
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-950 flex flex-col font-sans text-white overflow-hidden relative">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      {/* Header */}
      <header className="h-20 border-b border-zinc-800/50 flex items-center justify-between px-8 bg-zinc-900/40 backdrop-blur-xl z-20">
        <div className="flex items-center gap-4">
          <Logo className="w-10 h-10" />
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">StrangerChat</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="relative flex h-2 w-2">
                <div className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'connected' ? 'bg-emerald-400' : 'bg-zinc-400'}`}></div>
                <div className={`relative inline-flex rounded-full h-2 w-2 ${status === 'connected' ? 'bg-emerald-500' : 'bg-zinc-600'}`}></div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {status === 'searching' ? 'Searching...' : status === 'connected' ? 'Connected' : 'Offline'}
              </span>
              {status === 'connected' && (
                <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20 ml-1">ONLINE</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {status === 'connected' && (
            <div className="hidden md:flex items-center gap-3 bg-zinc-800/50 px-4 py-2 rounded-2xl border border-zinc-700/50">
              <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold text-zinc-300">
                {partnerName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-bold text-zinc-200">{partnerName}</span>
            </div>
          )}
          <button 
            onClick={() => window.location.reload()}
            className="p-3 bg-zinc-800/50 hover:bg-red-500/10 rounded-2xl transition-all text-zinc-400 hover:text-red-500 border border-zinc-700/50 hover:border-red-500/30 group"
            title="Leave Chat"
          >
            <LogOut className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide relative z-10">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${msg.sender === 'me' ? 'justify-end' : msg.sender === 'system' ? 'justify-center' : 'justify-start'}`}
              >
                {msg.sender === 'system' ? (
                  <div className={`text-[10px] font-bold uppercase tracking-widest px-6 py-2.5 rounded-full border backdrop-blur-sm shadow-sm ${
                    msg.text.includes('left') || msg.text.includes('blocked')
                      ? 'bg-red-500/5 text-red-500/60 border-red-500/10'
                      : 'bg-zinc-900/50 text-zinc-500 border-zinc-800/50'
                  }`}>
                    {msg.text}
                  </div>
                ) : (
                  <div className={`flex flex-col ${msg.sender === 'me' ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[70%]`}>
                    <div className={`px-5 py-3.5 rounded-3xl shadow-lg ${
                      msg.sender === 'me' 
                        ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white rounded-tr-none' 
                        : 'bg-zinc-800/80 backdrop-blur-sm text-zinc-100 rounded-tl-none border border-zinc-700/50'
                    }`}>
                      <p className="text-[15px] leading-relaxed break-words font-medium">{msg.text}</p>
                    </div>
                    <span className="text-[9px] font-bold text-zinc-600 mt-1.5 uppercase tracking-tighter px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </motion.div>
            ))}

            {isPartnerTyping && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 ml-1">
                  <div className="bg-zinc-800/40 px-3 py-2 rounded-2xl rounded-tl-none border border-zinc-700/30 flex gap-1 items-center">
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0 }} className="w-1 h-1 bg-zinc-500 rounded-full" />
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-zinc-500 rounded-full" />
                    <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-zinc-500 rounded-full" />
                  </div>
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Stranger is typing...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Controls */}
      <footer className="p-6 bg-zinc-900/60 backdrop-blur-2xl border-t border-zinc-800/50 z-20">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <div className="flex gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleSkip}
              className="flex items-center gap-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-6 py-4 rounded-2xl transition-all font-bold border border-zinc-700/50 shadow-lg active:bg-zinc-600"
            >
              <SkipForward className="w-5 h-5" />
              <span className="hidden sm:inline uppercase tracking-widest text-[11px]">Next Stranger</span>
            </motion.button>
            
            {status === 'connected' && !isBlocked && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleBlock}
                className="flex items-center gap-2.5 bg-zinc-800/50 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 px-5 py-4 rounded-2xl transition-all font-bold border border-zinc-700/50 hover:border-red-500/30 shadow-lg"
                title="Block Stranger"
              >
                <ShieldAlert className="w-5 h-5" />
              </motion.button>
            )}

            <form onSubmit={handleSendMessage} className="flex-1 flex gap-3">
              <div className="flex-1 relative group">
                <input
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder={status === 'connected' ? "Type something interesting..." : "Finding someone for you..."}
                  disabled={status !== 'connected'}
                  className="w-full bg-zinc-800/80 border border-zinc-700/50 text-white rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all placeholder:text-zinc-600 font-medium"
                />
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                type="submit"
                disabled={!inputText.trim() || status !== 'connected'}
                className="bg-gradient-to-br from-orange-400 to-orange-600 disabled:from-zinc-700 disabled:to-zinc-800 text-white px-6 rounded-2xl transition-all shadow-xl shadow-orange-500/20 disabled:shadow-none active:scale-95 flex items-center justify-center border border-orange-400/20"
              >
                <Send className="w-5 h-5" />
              </motion.button>
            </form>
          </div>
          
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[9px] font-bold uppercase tracking-widest text-zinc-600 pt-2">
            <button onClick={() => setCurrentView('terms')} className="hover:text-orange-500 transition-colors">Terms & Conditions</button>
            <button onClick={() => setCurrentView('privacy')} className="hover:text-orange-500 transition-colors">Privacy Policy</button>
            <button onClick={() => setCurrentView('guidelines')} className="hover:text-orange-500 transition-colors">Community Guidelines</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

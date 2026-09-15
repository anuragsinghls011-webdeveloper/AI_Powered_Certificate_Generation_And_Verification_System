import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Award, ShieldCheck, KeyRound, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';

export default function LandingPage({ onLogin, onRegister }) {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // Background parallax
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  
  // Hero section transforms
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.8]);
  const heroY = useTransform(scrollYProgress, [0, 0.2], ["0%", "20%"]);

  // Feature cards 3D transform
  const cardsRotateX = useTransform(scrollYProgress, [0.1, 0.3], [30, 0]);
  const cardsOpacity = useTransform(scrollYProgress, [0.1, 0.3], [0, 1]);
  const cardsScale = useTransform(scrollYProgress, [0.1, 0.3], [0.8, 1]);
  
  // CTA Section
  const ctaY = useTransform(scrollYProgress, [0.6, 0.8], ["30%", "0%"]);
  const ctaOpacity = useTransform(scrollYProgress, [0.6, 0.8], [0, 1]);

  return (
    <div ref={containerRef} className="relative bg-slate-950 font-sans text-slate-100 pb-0 flex flex-col">
      
      {/* Navbar fixed */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-8 md:py-6 bg-slate-950/80 backdrop-blur-md border-b border-white/10 transition-all">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <Award className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <span className="text-lg md:text-xl font-bold font-serif text-white">CampusCert Pro</span>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <button onClick={onLogin} className="px-3 py-2 md:px-4 md:py-2 text-sm font-semibold text-slate-300 hover:text-white transition">Sign In</button>
          <button onClick={onRegister} className="px-4 py-2 text-sm font-bold bg-white text-slate-900 rounded-lg hover:bg-slate-200 transition shadow-md hover:shadow-lg">Get Started</button>
        </div>
      </nav>

      {/* Dynamic Background */}
      <motion.div 
        style={{ y: bgY }}
        className="fixed inset-0 pointer-events-none z-0"
      >
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-brand-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-indigo-600/20 rounded-full blur-[120px]" />
      </motion.div>

      {/* 1. Hero Section */}
      <div className="sticky top-0 h-screen flex flex-col items-center justify-center px-4 overflow-hidden" style={{ perspective: '1200px' }}>
        <motion.div 
          style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
          className="relative z-10 grid lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto mt-16 w-full px-4 lg:px-8"
        >
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8"
            >
              <Zap className="w-4 h-4 text-brand-400" />
              <span className="text-xs md:text-sm font-medium text-slate-300">The new standard in credential management</span>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold font-serif leading-tight mb-6 bg-clip-text text-transparent bg-gradient-to-br from-white via-slate-200 to-slate-500"
            >
              Issue secure certificates <br className="hidden lg:block"/> at the speed of light.
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="text-base md:text-xl text-slate-400 max-w-lg mb-10"
            >
              CampusCert Pro automates bulk generation, verifies authenticity via blockchain-grade encryption, and handles multi-role workflows flawlessly.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
            >
              <button onClick={onRegister} className="px-8 py-4 bg-brand-600 text-white rounded-xl font-bold text-lg hover:bg-brand-700 transition flex items-center justify-center gap-2 shadow-lg shadow-brand-600/25">
                Start Building <ArrowRight className="w-5 h-5" />
              </button>
              <button onClick={onLogin} className="px-8 py-4 bg-white/5 text-white border border-white/10 rounded-xl font-bold text-lg hover:bg-white/10 transition backdrop-blur-sm">
                Sign In to Workspace
              </button>
            </motion.div>
          </div>

          {/* 3D Animated Certificate Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 50, rotateY: 15, rotateX: 10 }}
            animate={{ 
              opacity: 1, 
              x: 0,
              rotateY: [-5, 5, -5],
              rotateX: [5, 15, 5],
              y: [-15, 15, -15]
            }}
            transition={{
              opacity: { duration: 1, delay: 0.6 },
              x: { duration: 1, delay: 0.6 },
              rotateY: { duration: 8, repeat: Infinity, ease: "easeInOut" },
              rotateX: { duration: 7, repeat: Infinity, ease: "easeInOut" },
              y: { duration: 6, repeat: Infinity, ease: "easeInOut" }
            }}
            style={{ transformStyle: "preserve-3d" }}
            className="hidden lg:flex relative w-full aspect-[1.414/1] bg-white rounded-xl shadow-[0_0_80px_rgba(79,70,229,0.3)] overflow-hidden p-6"
          >
            {/* Colorful gradient border wrapper */}
            <div className="absolute inset-0 m-4 rounded-xl p-[6px] bg-gradient-to-br from-brand-600 via-pink-500 to-amber-400 pointer-events-none shadow-lg">
              {/* Inner paper texture/gradient */}
              <div className="w-full h-full bg-gradient-to-b from-amber-50 via-white to-brand-50 rounded-lg" />
            </div>

            {/* Inner subtle border */}
            <div className="absolute inset-0 m-8 rounded-lg border-[2px] border-brand-900/10 pointer-events-none" />

            {/* Certificate content */}
            <div className="w-full h-full flex flex-col items-center justify-center text-center relative z-10 px-8 py-6">
              <Award className="w-16 h-16 text-amber-500 mb-4 drop-shadow-md" />
              <h2 className="text-3xl font-serif font-bold text-slate-800 mb-2">Certificate of Excellence</h2>
              <p className="text-sm text-brand-600 mb-8 uppercase tracking-widest font-bold">This certifies that</p>
              <h3 className="text-4xl font-serif text-transparent bg-clip-text bg-gradient-to-r from-brand-700 to-pink-600 mb-8 italic border-b border-brand-200 pb-2 px-12 drop-shadow-sm">Jane Doe</h3>
              <p className="text-sm text-slate-700 max-w-sm mb-12 font-medium">Has successfully completed the advanced training program with outstanding performance and dedication.</p>
              
              <div className="flex justify-between w-full px-8 mt-auto">
                <div className="flex flex-col items-center">
                  <div className="w-32 h-px bg-brand-300 mb-2" />
                  <span className="text-[10px] font-bold text-brand-700 uppercase tracking-wider">Issue Date</span>
                </div>
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center shadow-md">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-32 h-px bg-brand-300 mb-2" />
                  <span className="text-[10px] font-bold text-brand-700 uppercase tracking-wider">Director Signature</span>
                </div>
              </div>
            </div>
            {/* Glass reflection overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/50 to-white/0 pointer-events-none rounded-xl" />
          </motion.div>
        </motion.div>
      </div>

      {/* 2. Features Section (3D Scroll) */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-32" style={{ perspective: '1200px' }}>
        <motion.div 
          style={{ 
            rotateX: cardsRotateX, 
            opacity: cardsOpacity, 
            scale: cardsScale,
            transformStyle: "preserve-3d"
          }}
          className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto w-full"
        >
          {[
            { icon: Zap, title: "Lightning Fast Bulk", desc: "Generate thousands of personalized PDFs in seconds using smart tags and drag-and-drop CSV data mapping." },
            { icon: ShieldCheck, title: "Tamper-Proof Verification", desc: "Every certificate contains a unique cryptographic signature and scannable QR code for instant global verification." },
            { icon: KeyRound, title: "Enterprise RBAC", desc: "Invite team members with granular roles (Viewer, Editor, Admin) and manage multiple organization workspaces." }
          ].map((feat, i) => (
            <div key={i} className="group relative p-8 rounded-3xl bg-slate-900/50 border border-white/10 backdrop-blur-xl hover:bg-slate-800/80 transition duration-500 overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent opacity-0 group-hover:opacity-100 transition duration-500" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 flex items-center justify-center mb-6 shadow-lg shadow-brand-900/50">
                  <feat.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl md:text-2xl font-bold font-serif text-white mb-3">{feat.title}</h3>
                <p className="text-sm md:text-base text-slate-400 leading-relaxed">{feat.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* 3. CTA Section */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 pb-20">
        <motion.div 
          style={{ y: ctaY, opacity: ctaOpacity }}
          className="max-w-4xl mx-auto w-full p-8 md:p-20 rounded-[3rem] bg-gradient-to-br from-brand-900 via-brand-800 to-indigo-900 text-center relative overflow-hidden border border-white/10 shadow-2xl shadow-brand-900/40"
        >
          <div className="absolute -top-24 -right-24 opacity-10">
            <Award className="w-72 h-72 md:w-96 md:h-96" />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-bold font-serif text-white mb-6">Ready to upgrade your credentials?</h2>
            <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto">Join thousands of organizations issuing secure, stunning certificates with CampusCert Pro.</p>
            <button onClick={onRegister} className="w-full sm:w-auto px-10 py-5 bg-white text-brand-900 rounded-2xl font-bold text-lg md:text-xl hover:bg-slate-100 transition shadow-xl inline-flex items-center justify-center gap-3 hover:scale-105 active:scale-95 duration-200">
              Create your free account <ArrowRight className="w-6 h-6" />
            </button>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 text-sm text-brand-200">
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> No credit card required</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Setup in 2 minutes</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* 4. Footer Section */}
      <footer className="relative z-10 w-full border-t border-white/10 bg-slate-950/80 pt-16 pb-8 px-6 md:px-12 mt-auto">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
                <Award className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold font-serif text-white">CampusCert Pro</span>
            </div>
            <p className="text-slate-400 max-w-sm mb-6">
              Empowering institutions with secure, verifiable, and beautiful credentials at scale.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-brand-600 transition text-slate-300 hover:text-white">
                <span className="sr-only">Twitter</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" /></svg>
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-brand-600 transition text-slate-300 hover:text-white">
                <span className="sr-only">GitHub</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
              </a>
            </div>
          </div>
          
          <div>
            <h4 className="text-white font-semibold mb-4">Product</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-slate-400 hover:text-brand-400 transition">Features</a></li>
              <li><a href="#" className="text-slate-400 hover:text-brand-400 transition">Pricing</a></li>
              <li><a href="#" className="text-slate-400 hover:text-brand-400 transition">Security</a></li>
              <li><a href="#" className="text-slate-400 hover:text-brand-400 transition">Enterprise</a></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-semibold mb-4">Company</h4>
            <ul className="space-y-3">
              <li><a href="#" className="text-slate-400 hover:text-brand-400 transition">About Us</a></li>
              <li><a href="#" className="text-slate-400 hover:text-brand-400 transition">Careers</a></li>
              <li><a href="#" className="text-slate-400 hover:text-brand-400 transition">Contact</a></li>
              <li><a href="#" className="text-slate-400 hover:text-brand-400 transition">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        
        <div className="max-w-6xl mx-auto pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500">
          <p>© {new Date().getFullYear()} CampusCert Pro. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-slate-300 transition">Terms of Service</a>
            <a href="#" className="hover:text-slate-300 transition">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

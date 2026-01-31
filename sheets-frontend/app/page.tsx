'use client';

import React, { useState } from 'react';
import { Calendar, BarChart3, Check, Sparkles, Linkedin, Menu, X, Instagram, QrCode } from 'lucide-react';

// Reusable Navigation Component
function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-emerald-200/60 bg-white/80 backdrop-blur-xl shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-md">
            <img src="/logo.png" alt="Lernova Attendsheets Logo" className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <span className="text-base sm:text-xl font-bold text-emerald-900">Lernova Attendsheets</span>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          <a href="/" className="text-md font-medium text-emerald-600">Home</a>
          <a href="/about" className="text-md font-medium text-slate-600 hover:text-emerald-600 transition-colors">About Us</a>
          <a href="/contact" className="text-md font-medium text-slate-600 hover:text-emerald-600 transition-colors">Contact</a>
          <a href="/auth" className="px-6 py-2.5 bg-emerald-600 text-white text-md font-medium rounded-lg hover:bg-emerald-700 hover:shadow-lg transition-all">Sign Up</a>
        </div>

        {/* Mobile Menu Button */}
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden p-2 text-slate-600 hover:text-emerald-600 transition-colors"
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Navigation Menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-emerald-200/60 bg-white/95 backdrop-blur-xl">
          <div className="px-4 py-4 flex flex-col gap-3">
            <a href="/" className="text-md font-medium text-emerald-600 py-2" onClick={() => setIsMenuOpen(false)}>Home</a>
            <a href="/about" className="text-md font-medium text-slate-600 hover:text-emerald-600 transition-colors py-2" onClick={() => setIsMenuOpen(false)}>About Us</a>
            <a href="/contact" className="text-md font-medium text-slate-600 hover:text-emerald-600 transition-colors py-2" onClick={() => setIsMenuOpen(false)}>Contact</a>
            <a href="/auth" className="px-6 py-3 bg-emerald-600 text-white text-md font-medium rounded-lg hover:bg-emerald-700 text-center mt-2" onClick={() => setIsMenuOpen(false)}>Sign Up</a>
          </div>
        </div>
      )}
    </nav>
  );
}

// Hero Section Component
function HeroSection() {
  return (
    <section className="pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-16 md:pb-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-100 text-emerald-700 rounded-full text-xs sm:text-sm font-medium mb-6 sm:mb-8 shadow-sm">
          <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
          Modern Attendance Management System
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-slate-900 mb-4 sm:mb-6 leading-tight">
          Track attendance with
          <span className="block bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent mt-2">
            effortless precision
          </span>
        </h1>

        <p className="text-base sm:text-lg md:text-xl text-slate-600 mb-8 sm:mb-10 md:mb-12 max-w-3xl mx-auto leading-relaxed">
          A beautiful, intuitive platform designed for educators to manage student attendance, track performance, and generate comprehensive insights - All in one powerful dashboard.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
          <a href="/auth" className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-emerald-600 text-white text-base sm:text-lg font-semibold rounded-xl hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl text-center">
            Start Tracking Now
          </a>
          <a href="/about" className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-white text-emerald-600 text-base sm:text-lg font-semibold rounded-xl border-2 border-emerald-200 hover:bg-emerald-50 transition-all text-center">
            Learn More
          </a>
        </div>
      </div>
    </section>
  );
}

// Features Section Component
function FeaturesSection() {
  const features = [
    {
      icon: QrCode,
      title: 'QR Marking',
      description: 'Allow students to mark attendance instantly by scanning a unique QR code. Simplify tracking and reduce manual entry errors.',
      borderColor: 'border-cyan-100',
      bgGradient: 'from-cyan-100 to-cyan-200',
      iconColor: 'text-cyan-600'
    },
    {
      
      icon: Calendar,
      title: 'Monthly Tracking',
      description: 'Track attendance day-by-day with an intuitive calendar interface. Mark students as present, absent, or late with just one click.',
      borderColor: 'border-emerald-100',
      bgGradient: 'from-emerald-100 to-emerald-200',
      iconColor: 'text-emerald-600'
    },
    {
      icon: BarChart3,
      title: 'Real-time Insights',
      description: 'Monitor attendance percentages and risk levels instantly. Identify students who need support before it\'s too late.',
      borderColor: 'border-teal-100',
      bgGradient: 'from-teal-100 to-teal-200',
      iconColor: 'text-teal-600'
    },
    {
      icon: Check,
      title: 'Custom Fields',
      description: 'Add custom columns to track emails, phone numbers, sections, or any information that matters to your classes.',
      borderColor: 'border-cyan-100',
      bgGradient: 'from-cyan-100 to-cyan-200',
      iconColor: 'text-cyan-600'
    }
  ];

  return (
    <section className="py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6 bg-white/50 backdrop-blur">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center text-slate-900 mb-10 sm:mb-12 md:mb-16">Key Features</h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div key={idx} className={`bg-white rounded-2xl p-6 sm:p-8 shadow-md border ${feature.borderColor} hover:shadow-xl transition-all hover:-translate-y-1`}>
                <div className={`w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br ${feature.bgGradient} rounded-xl flex items-center justify-center mb-4 sm:mb-5 shadow-sm`}>
                  <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${feature.iconColor}`} />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3">{feature.title}</h3>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Stats Section Component
function StatsSection() {
  const stats = [
    { number: '10K', label: 'Active Users' },
    { number: '500K', label: 'Students Tracked' },
    { number: '50M', label: 'Attendance Records' },
    { number: '99.9%', label: 'Uptime Guaranteed' }
  ];

  return (
    <section className="py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl sm:rounded-3xl p-8 sm:p-12 md:p-16 shadow-2xl text-center text-white">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">Trusted by Educators Worldwide</h2>
        <p className="text-base sm:text-lg md:text-xl text-emerald-50 mb-8 sm:mb-10 md:mb-12 max-w-2xl mx-auto">
          Join thousands of educators who have transformed their attendance management
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {stats.map((stat, idx) => (
            <div key={idx}>
              <div className="text-3xl sm:text-4xl md:text-5xl font-bold mb-1 sm:mb-2">{stat.number}</div>
              <div className="text-xs sm:text-sm md:text-base text-emerald-100">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// CTA Section Component
function CTASection() {
  return (
    <section className="py-12 sm:py-16 md:py-20 lg:py-24 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 mb-4 sm:mb-6">Ready to get started?</h2>
        <p className="text-base sm:text-lg md:text-xl text-slate-600 mb-8 sm:mb-10 md:mb-12">
          Join thousands of educators managing attendance efficiently with Lernova Attendsheets.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <a href="/auth" className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-4 bg-emerald-600 text-white text-base sm:text-lg font-semibold rounded-xl hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl text-center">
            Create Free Account
          </a>
        </div>
      </div>
    </section>
  );
}

// Footer Component
function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-12 sm:py-16 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid gap-8 sm:gap-12 mb-8 sm:mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center">
                <img src="/logo.png" alt="Lernova Attendsheets Logo" className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <span className="text-lg sm:text-xl font-bold">Lernova Attendsheets</span>
            </div>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Lernova Attendsheets by Lernova © 2026. All rights reserved.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-6 sm:pt-8 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-4">
          <p className="text-slate-400 text-xs sm:text-sm text-center md:text-left">
            By Muhammad Nabeel • Rituraj Thakur • Archita Parab • Shweta Yadav • Aksh Devlapalli • Mohnish Pembarthi
            <br />
            Students at Atharva University, Mumbai
          </p>

          <div className="flex items-center gap-3 sm:gap-4">
            <a href="https://www.instagram.com/lernova.official" className="w-10 h-10 bg-slate-800 hover:bg-emerald-600 rounded-lg flex items-center justify-center transition-colors">
              <Instagram className="w-5 h-5" />
            </a>
            <a href="https://www.linkedin.com/company/lernova-official" className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-800 hover:bg-emerald-600 rounded-lg flex items-center justify-center transition-colors">
              <Linkedin className="w-4 h-4 sm:w-5 sm:h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Main Page Component
export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <Navigation />
      <HeroSection />
      <FeaturesSection />
      <StatsSection />
      <CTASection />
      <Footer />
    </div>
  );
}
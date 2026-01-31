'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Clock, Send, Linkedin, CheckCircle, AlertCircle, Menu, X, Instagram } from 'lucide-react';
import { contactService } from '@/lib/contactService';

// Navigation Component with Mobile Menu
function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-emerald-200/60 bg-white/80 backdrop-blur-xl shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md">
            <img src="/logo.png" alt="Lernova Attendsheets Logo" className="w-10 h-10" />
          </div>
          <span className="text-xl font-bold text-emerald-900">
            <Link href="/">Lernova Attendsheets</Link>
          </span>
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/" className="text-md font-medium text-slate-600 hover:text-emerald-600 transition-colors">Home</Link>
          <Link href="/about" className="text-md font-medium text-slate-600 hover:text-emerald-600 transition-colors">About Us</Link>
          <Link href="/contact" className="text-md font-medium text-emerald-600">Contact</Link>
          <Link href="/auth" className="px-6 py-2.5 bg-emerald-600 text-white text-md font-medium rounded-lg hover:bg-emerald-700 hover:shadow-lg transition-all">Sign Up</Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden w-10 h-10 flex items-center justify-center text-slate-600 hover:text-emerald-600 transition-colors"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-emerald-200/60 bg-white/95 backdrop-blur-xl">
          <div className="px-6 py-4 flex flex-col gap-4">
            <Link 
              href="/" 
              className="text-md font-medium text-slate-600 hover:text-emerald-600 transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Home
            </Link>
            <Link 
              href="/about" 
              className="text-md font-medium text-slate-600 hover:text-emerald-600 transition-colors py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              About Us
            </Link>
            <Link 
              href="/contact" 
              className="text-md font-medium text-emerald-600 py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Contact
            </Link>
            <Link 
              href="/auth" 
              className="px-6 py-2.5 bg-emerald-600 text-white text-md font-medium rounded-lg hover:bg-emerald-700 hover:shadow-lg transition-all text-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// Hero Section
function HeroSection() {
  return (
    <section className="pt-32 pb-2 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-2">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-4">Get in Touch</h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
          </p>
        </div>
      </div>
    </section>
  );
}

// Contact Info Section with Responsive Layout
function ContactInfoSection() {
  const contactInfo = [
    {
      icon: Mail,
      title: 'Email',
      details: ['lernova.attendsheets@gmail.com'],
      color: 'emerald'
    },
    {
      icon: Clock,
      title: 'Business Hours',
      details: ['Monday - Friday', '9:00 AM - 6:00 PM IST'],
      color: 'teal'
    }
  ];

  return (
    <section className="py-12 md:py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Desktop Layout: Side by Side */}
        <div className="hidden md:grid md:grid-cols-2 gap-12">
          <div className="space-y-8">
            <h2 className="text-4xl font-bold text-slate-900">Contact Information</h2>

            {contactInfo.map((info, idx) => {
              const Icon = info.icon;
              const colorMap = {
                emerald: 'bg-emerald-100 text-emerald-600',
                teal: 'bg-teal-100 text-teal-600',
                cyan: 'bg-cyan-100 text-cyan-600'
              };

              return (
                <div key={idx} className="flex gap-4">
                  <div className={`w-12 h-12 ${colorMap[info.color as keyof typeof colorMap]} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{info.title}</h3>
                    {info.details.map((detail, didx) => (
                      <p key={didx} className="text-slate-600 text-sm">{detail}</p>
                    ))}
                  </div>
                </div>
              );
            })}
            <FAQSection />
          </div>
          <ContactForm />
        </div>

        {/* Mobile/Tablet Layout: Form First, Then FAQs */}
        <div className="md:hidden space-y-12">
          <ContactForm />
          <FAQSection />
        </div>
      </div>
    </section>
  );
}

// Contact Form Component with Backend Integration
function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.message) {
      setSubmitResult({
        success: false,
        message: 'Please fill in all required fields'
      });
      return;
    }

    setSubmitting(true);
    setSubmitResult(null);

    try {
      const result = await contactService.submitContactForm(formData);

      setSubmitResult(result);

      if (result.success) {
        // Clear form on success
        setFormData({ name: '', email: '', subject: '', message: '' });

        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          setSubmitResult(null);
        }, 5000);
      }
    } catch (error) {
      setSubmitResult({
        success: false,
        message: 'An unexpected error occurred. Please try again.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-6 md:p-8 shadow-lg border border-emerald-100 my-auto">
      <h3 className="text-2xl font-bold text-slate-900 mb-6">Send us a Message</h3>

      {submitResult && (
        <div className={`mb-6 p-4 rounded-lg border ${submitResult.success
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-red-50 border-red-200'
          }`}>
          <div className="flex items-start gap-3">
            {submitResult.success ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm font-semibold ${submitResult.success ? 'text-emerald-700' : 'text-red-700'
              }`}>
              {submitResult.message}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Full Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="John Doe"
              disabled={submitting}
              required
              className="w-full px-4 py-3 border-2 text-black border-gray-200 rounded-xl text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="john@example.com"
              disabled={submitting}
              required
              className="w-full px-4 py-3 border-2 text-black border-gray-200 rounded-xl text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">Subject</label>
          <input
            type="text"
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            placeholder="How can we help you?"
            disabled={submitting}
            className="w-full px-4 py-3 border-2 text-black border-gray-200 rounded-xl text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">Message *</label>
          <textarea
            name="message"
            value={formData.message}
            onChange={handleChange}
            rows={6}
            placeholder="Tell us more about your inquiry..."
            disabled={submitting}
            required
            className="w-full px-4 py-3 border-2 text-black border-gray-200 rounded-xl text-base focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-colors resize-none disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full px-6 py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 hover:shadow-lg transition-all flex items-center cursor-pointer justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Sending...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Send Message
            </>
          )}
        </button>

        <p className="text-sm text-slate-500 text-center">
          We typically respond within 24 hours during business days
        </p>
      </form>
    </div>
  );
}

// FAQ Section
function FAQSection() {
  const faqs = [
    {
      question: 'How quickly will I receive a response?',
      answer: 'We aim to respond to all inquiries within 24 hours during business days.'
    },
    {
      question: 'Do you offer technical support?',
      answer: 'Yes! Our support team is available to help with any technical issues you may encounter.'
    },
  ];

  return (
    <section className="py-10">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-8 md:mb-12">Frequently Asked Questions</h2>

        <div className="space-y-6">
          {faqs.map((faq, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-6 md:p-8 shadow-md border border-emerald-100 hover:shadow-lg transition-all">
              <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-3">{faq.question}</h3>
              <p className="text-slate-600 leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Footer Component
function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid gap-12 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center">
                <img src="/logo.png" alt="Lernova Attendsheets Logo" className="w-10 h-10" />
              </div>
              <span className="text-xl font-bold">Lernova Attendsheets</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Lernova Attendsheets by Lernova © 2026. All rights reserved.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-400 text-sm text-center md:text-left">
            By Muhammad Nabeel • Rituraj Thakur • Archita Parab • Shweta Yadav • Aksh Devlapalli • Mohnish Pembarthi
            <br />
            Students at Atharva University, Mumbai
          </p>

          <div className="flex items-center gap-4">
            <a href="https://www.instagram.com/lernova.official" className="w-10 h-10 bg-slate-800 hover:bg-emerald-600 rounded-lg flex items-center justify-center transition-colors">
              <Instagram className="w-5 h-5" />
            </a>
            <a href="https://www.linkedin.com/company/lernova-official" className="w-10 h-10 bg-slate-800 hover:bg-emerald-600 rounded-lg flex items-center justify-center transition-colors">
              <Linkedin className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      <Navigation />
      <HeroSection />
      <ContactInfoSection />
      <Footer />
    </div>
  );
}
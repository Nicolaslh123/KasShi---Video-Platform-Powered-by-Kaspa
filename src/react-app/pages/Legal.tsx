import { useState } from "react";
import LocalizedLink from "../components/LocalizedLink";
import { ArrowLeft, Shield, FileText, Scale, AlertTriangle, Mail } from "lucide-react";
import { KasShiLogo } from "../components/KasShiLogo";

type LegalSection = "privacy" | "terms" | "disclaimer" | "dmca" | "cookies";

const sections: { id: LegalSection; name: string; icon: typeof Shield }[] = [
  { id: "privacy", name: "Privacy Policy", icon: Shield },
  { id: "terms", name: "Terms of Service", icon: FileText },
  { id: "disclaimer", name: "Risk Disclaimer", icon: AlertTriangle },
  { id: "dmca", name: "DMCA & Copyright", icon: Scale },
  { id: "cookies", name: "Cookie Policy", icon: FileText },
];

export default function Legal() {
  const [activeSection, setActiveSection] = useState<LegalSection>("privacy");
  const lastUpdated = "January 2025";

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/5 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <LocalizedLink to="/" className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </LocalizedLink>
          <KasShiLogo size={32} />
          <h1 className="text-xl font-bold text-white">Legal</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Section Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 p-2 bg-white/5 rounded-xl border border-white/10">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeSection === section.id
                    ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon className="w-4 h-4" />
                {section.name}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="prose prose-invert max-w-none">
          <div className="p-6 sm:p-8 rounded-2xl bg-white/5 border border-white/10">
            <p className="text-white/40 text-sm mb-6">Last updated: {lastUpdated}</p>

            {activeSection === "privacy" && <PrivacyPolicy />}
            {activeSection === "terms" && <TermsOfService />}
            {activeSection === "disclaimer" && <RiskDisclaimer />}
            {activeSection === "dmca" && <DMCAPolicy />}
            {activeSection === "cookies" && <CookiePolicy />}
          </div>
        </div>

        {/* Contact */}
        <div className="mt-8 p-6 rounded-2xl bg-teal-500/10 border border-teal-500/20">
          <div className="flex items-center gap-3 mb-3">
            <Mail className="w-5 h-5 text-teal-400" />
            <h3 className="text-lg font-semibold text-white">Questions?</h3>
          </div>
          <p className="text-white/60 text-sm">
            For any questions about these policies or to exercise your privacy rights, 
            contact us at <a href="mailto:legal@kasshi.io" className="text-teal-400 hover:underline">legal@kasshi.io</a>
          </p>
        </div>
      </main>
    </div>
  );
}

function PrivacyPolicy() {
  return (
    <div className="space-y-6 text-white/80">
      <h2 className="text-2xl font-bold text-white">Privacy Policy</h2>
      
      <section>
        <h3 className="text-xl font-semibold text-white mb-3">1. Introduction</h3>
        <p>
          KasShi ("we," "our," or "us") respects your privacy and is committed to protecting your personal data. 
          This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">2. Information We Collect</h3>
        <h4 className="text-lg font-medium text-white/90 mb-2">Account Information</h4>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Email address (via Google OAuth)</li>
          <li>Name and profile picture (from Google account)</li>
          <li>User ID and account creation date</li>
        </ul>
        
        <h4 className="text-lg font-medium text-white/90 mb-2 mt-4">Wallet Information</h4>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Kaspa wallet address (publicly visible on the blockchain)</li>
          <li>Encrypted private keys (stored securely, never accessible in plaintext)</li>
          <li>Encrypted wallet recovery phrases</li>
          <li>Transaction history and balances</li>
        </ul>

        <h4 className="text-lg font-medium text-white/90 mb-2 mt-4">Content & Activity</h4>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Videos you upload, including metadata (title, description, tags)</li>
          <li>Comments, likes, and other interactions</li>
          <li>Watch history and viewing patterns</li>
          <li>Channel subscriptions and memberships</li>
        </ul>

        <h4 className="text-lg font-medium text-white/90 mb-2 mt-4">Technical Information</h4>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>IP address and approximate location</li>
          <li>Browser type and device information</li>
          <li>Cookies and similar tracking technologies</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">3. How We Use Your Information</h3>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>To provide and maintain our platform</li>
          <li>To process cryptocurrency transactions</li>
          <li>To personalize your experience and content recommendations</li>
          <li>To communicate with you about your account</li>
          <li>To enforce our Terms of Service and community guidelines</li>
          <li>To detect and prevent fraud, abuse, and security issues</li>
          <li>To comply with legal obligations</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">4. Data Sharing</h3>
        <p className="mb-3">We do NOT sell your personal data to third parties. We may share data only in these circumstances:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li><strong>Blockchain transactions:</strong> Wallet addresses and transaction amounts are publicly visible on the Kaspa blockchain</li>
          <li><strong>Service providers:</strong> We use Cloudflare for hosting and security (they process data under strict contractual obligations)</li>
          <li><strong>Legal requirements:</strong> We may disclose data if required by law or valid legal process</li>
          <li><strong>Safety:</strong> To protect the rights, safety, or property of our users or the public</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">5. Data Security</h3>
        <p>
          We implement industry-standard security measures including encryption, secure authentication, and regular security audits. 
          Your wallet private keys and recovery phrases are encrypted and never stored in plaintext. 
          However, no system is 100% secure, and you are responsible for keeping your credentials safe.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">6. Your Rights</h3>
        <p className="mb-3">Depending on your location, you may have the right to:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Access and receive a copy of your personal data</li>
          <li>Correct inaccurate personal data</li>
          <li>Delete your personal data (subject to legal retention requirements)</li>
          <li>Object to or restrict processing of your data</li>
          <li>Data portability</li>
          <li>Withdraw consent at any time</li>
        </ul>
        <p className="mt-3">
          To exercise these rights, contact us at <a href="mailto:legal@kasshi.io" className="text-teal-400 hover:underline">legal@kasshi.io</a>.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">7. Data Retention</h3>
        <p>
          We retain your data for as long as your account is active or as needed to provide services. 
          Transaction records may be retained longer for legal, tax, or audit purposes. 
          Blockchain transactions are permanent and cannot be deleted.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">8. International Transfers</h3>
        <p>
          Your data may be processed in countries other than your own. We use Cloudflare's global infrastructure, 
          which may involve data transfers to various jurisdictions. We ensure appropriate safeguards are in place for such transfers.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">9. Changes to This Policy</h3>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy 
          on this page and updating the "Last updated" date. Continued use of the platform after changes constitutes acceptance.
        </p>
      </section>
    </div>
  );
}

function TermsOfService() {
  return (
    <div className="space-y-6 text-white/80">
      <h2 className="text-2xl font-bold text-white">Terms of Service</h2>
      
      <section>
        <h3 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h3>
        <p>
          By accessing or using KasShi, you agree to be bound by these Terms of Service and all applicable laws and regulations. 
          If you do not agree with any part of these terms, you may not use our platform.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">2. Eligibility</h3>
        <p>By using KasShi, you represent and warrant that:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>You are at least 13 years of age</li>
          <li>If you are under 18, you have parental or guardian consent to use this platform</li>
          <li>You understand that KasShi involves cryptocurrency transactions that are irreversible</li>
          <li>You are not prohibited from using cryptocurrency in your jurisdiction</li>
          <li>You will comply with all applicable laws and regulations</li>
        </ul>
        <p className="mt-3 text-amber-400">
          ⚠️ If you are under 18, please ensure a parent or guardian understands you are using a platform that involves real cryptocurrency with real monetary value. All transactions are final.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">3. Account Responsibilities</h3>
        <p>You are responsible for:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>Maintaining the security of your account credentials</li>
          <li>Safeguarding your wallet recovery phrase</li>
          <li>All activities that occur under your account</li>
          <li>Notifying us immediately of any unauthorized access</li>
        </ul>
        <p className="mt-3 text-amber-400">
          ⚠️ If you lose your wallet recovery phrase, you will permanently lose access to your funds. We cannot recover it for you.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">4. Prohibited Content</h3>
        <p>You may not upload, post, or share content that:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>Is illegal, harmful, threatening, abusive, harassing, defamatory, or invasive of privacy</li>
          <li>Contains sexually explicit material involving minors</li>
          <li>Promotes violence, terrorism, or hate speech</li>
          <li>Infringes on intellectual property rights</li>
          <li>Contains malware, viruses, or harmful code</li>
          <li>Is fraudulent, deceptive, or misleading</li>
          <li>Violates any applicable law or regulation</li>
        </ul>
        <p className="mt-3">
          We reserve the right to remove any content and terminate accounts that violate these guidelines without prior notice.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">5. Cryptocurrency Transactions</h3>
        <p>By using KasShi's payment features, you acknowledge that:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>All KAS transactions are final and irreversible</li>
          <li>You are solely responsible for verifying transaction details before confirming</li>
          <li>Cryptocurrency values fluctuate and we are not responsible for any losses</li>
          <li>We charge platform fees as disclosed in the app</li>
          <li>You are responsible for reporting and paying any applicable taxes</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">6. Intellectual Property</h3>
        <p>
          You retain ownership of content you create and upload. By uploading content, you grant KasShi a non-exclusive, 
          worldwide, royalty-free license to use, display, and distribute your content on our platform. 
          You represent that you have all necessary rights to the content you upload.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">7. Disclaimers</h3>
        <p>
          KASSHI IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. 
          WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE. 
          WE ARE NOT RESPONSIBLE FOR ANY LOSS OF FUNDS, DATA, OR PROFITS ARISING FROM YOUR USE OF THE PLATFORM.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">8. Limitation of Liability</h3>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, KASSHI AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, 
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR CRYPTOCURRENCY, 
          REGARDLESS OF THE CAUSE OF ACTION OR THE ALLEGED THEORY OF LIABILITY.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">9. Indemnification</h3>
        <p>
          You agree to indemnify and hold harmless KasShi, its operators, and affiliates from any claims, damages, 
          losses, or expenses arising from your use of the platform, your content, or your violation of these terms.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">10. Termination</h3>
        <p>
          We may suspend or terminate your account at any time for any reason, including violation of these terms. 
          Upon termination, your right to use the platform ceases immediately. 
          You may withdraw any remaining KAS from your wallet before termination takes effect.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">11. Governing Law</h3>
        <p>
          These terms shall be governed by and construed in accordance with applicable laws. 
          Any disputes shall be resolved through binding arbitration or in the courts of competent jurisdiction.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">12. Changes to Terms</h3>
        <p>
          We reserve the right to modify these terms at any time. Material changes will be communicated through the platform. 
          Continued use after changes constitutes acceptance of the new terms.
        </p>
      </section>
    </div>
  );
}

function RiskDisclaimer() {
  return (
    <div className="space-y-6 text-white/80">
      <h2 className="text-2xl font-bold text-white">Cryptocurrency Risk Disclaimer</h2>
      
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-200">
            <strong>Important:</strong> Cryptocurrency involves significant financial risk. 
            You could lose some or all of your funds. Only use money you can afford to lose.
          </p>
        </div>
      </div>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">1. No Financial Advice</h3>
        <p>
          KasShi does not provide financial, investment, tax, or legal advice. 
          Nothing on this platform should be construed as a recommendation to buy, sell, or hold cryptocurrency. 
          You should consult qualified professionals before making any financial decisions.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">2. Volatility Risk</h3>
        <p>
          Cryptocurrency prices, including Kaspa (KAS), are highly volatile and can fluctuate dramatically in short periods. 
          The value of your holdings may increase or decrease significantly. Past performance is not indicative of future results.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">3. Irreversible Transactions</h3>
        <p>
          All cryptocurrency transactions on the Kaspa blockchain are final and irreversible. 
          If you send KAS to the wrong address or lose access to your wallet, there is no way to recover those funds. 
          Double-check all transaction details before confirming.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">4. Wallet Security</h3>
        <p>You are solely responsible for:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>Securing your wallet recovery phrase (24 words)</li>
          <li>Never sharing your recovery phrase with anyone</li>
          <li>Storing your recovery phrase in a safe, offline location</li>
          <li>Using strong, unique passwords and enabling 2FA</li>
        </ul>
        <p className="mt-3 text-red-400">
          ⚠️ Anyone with access to your recovery phrase can steal all your funds. 
          KasShi will NEVER ask for your recovery phrase.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">5. Regulatory Uncertainty</h3>
        <p>
          Cryptocurrency regulations vary by jurisdiction and are constantly evolving. 
          You are responsible for understanding and complying with all applicable laws in your location. 
          Regulatory changes could affect the availability or legality of using KasShi in your jurisdiction.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">6. Tax Obligations</h3>
        <p>
          Cryptocurrency transactions may be taxable events in your jurisdiction. 
          You are solely responsible for determining and fulfilling your tax obligations. 
          We recommend consulting a tax professional familiar with cryptocurrency.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">7. Platform Risks</h3>
        <p>While we strive for security and reliability, risks include:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>Technical failures or bugs</li>
          <li>Network congestion or downtime</li>
          <li>Cyberattacks or security breaches</li>
          <li>Changes to the Kaspa protocol</li>
          <li>Service discontinuation</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">8. No Guarantees</h3>
        <p>
          We make no guarantees about the profitability of using KasShi, the value of any cryptocurrency, 
          or the reliability of the platform. Use at your own risk.
        </p>
      </section>
    </div>
  );
}

function DMCAPolicy() {
  return (
    <div className="space-y-6 text-white/80">
      <h2 className="text-2xl font-bold text-white">DMCA & Copyright Policy</h2>
      
      <section>
        <h3 className="text-xl font-semibold text-white mb-3">1. Respect for Intellectual Property</h3>
        <p>
          KasShi respects the intellectual property rights of others and expects users to do the same. 
          We will respond to clear notices of alleged copyright infringement in accordance with the 
          Digital Millennium Copyright Act (DMCA) and similar laws.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">2. Filing a DMCA Takedown Notice</h3>
        <p>If you believe your copyrighted work has been infringed, please send a notice containing:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>Your physical or electronic signature</li>
          <li>Identification of the copyrighted work(s) claimed to be infringed</li>
          <li>Identification of the infringing material with enough detail to locate it (URL)</li>
          <li>Your contact information (address, phone, email)</li>
          <li>A statement that you have a good faith belief the use is not authorized</li>
          <li>A statement, under penalty of perjury, that the information is accurate and you are authorized to act on behalf of the copyright owner</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">3. Where to Send Notices</h3>
        <p>
          Send DMCA notices to: <a href="mailto:dmca@kasshi.io" className="text-teal-400 hover:underline">dmca@kasshi.io</a>
        </p>
        <p className="mt-2 text-white/60">
          Include "DMCA Takedown Request" in the subject line.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">4. Counter-Notification</h3>
        <p>
          If you believe your content was removed by mistake or misidentification, you may file a counter-notification containing:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>Your physical or electronic signature</li>
          <li>Identification of the removed material and its prior location</li>
          <li>A statement under penalty of perjury that you believe the removal was a mistake</li>
          <li>Your name, address, phone number</li>
          <li>Consent to jurisdiction of your local federal court</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">5. Repeat Infringers</h3>
        <p>
          We maintain a policy of terminating accounts of users who are repeat infringers. 
          Multiple valid DMCA complaints against your account may result in permanent termination.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">6. False Claims</h3>
        <p className="text-amber-400">
          ⚠️ Filing a false DMCA claim is illegal and may result in liability for damages. 
          Only file claims for content you legitimately own or are authorized to protect.
        </p>
      </section>
    </div>
  );
}

function CookiePolicy() {
  return (
    <div className="space-y-6 text-white/80">
      <h2 className="text-2xl font-bold text-white">Cookie Policy</h2>
      
      <section>
        <h3 className="text-xl font-semibold text-white mb-3">1. What Are Cookies?</h3>
        <p>
          Cookies are small text files stored on your device when you visit websites. 
          They help websites remember your preferences and improve your experience.
        </p>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">2. Cookies We Use</h3>
        
        <h4 className="text-lg font-medium text-white/90 mb-2 mt-4">Essential Cookies</h4>
        <p>Required for the platform to function. These include:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>Authentication session cookies</li>
          <li>Security cookies (CSRF protection)</li>
          <li>Load balancing cookies</li>
        </ul>

        <h4 className="text-lg font-medium text-white/90 mb-2 mt-4">Functional Cookies</h4>
        <p>Enhance your experience:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>Theme preferences (light/dark mode)</li>
          <li>Volume settings</li>
          <li>Language preferences</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">3. Local Storage</h3>
        <p>We also use browser local storage for:</p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>Wallet connection status</li>
          <li>Draft content (auto-save)</li>
          <li>User preferences</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">4. Third-Party Cookies</h3>
        <p>
          We minimize third-party cookies. Currently, we use:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li><strong>Cloudflare:</strong> For security, performance, and analytics</li>
          <li><strong>Google:</strong> For authentication (Google OAuth)</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">5. Managing Cookies</h3>
        <p>
          You can control cookies through your browser settings. Note that disabling essential cookies 
          may prevent you from using certain features of the platform. Most browsers allow you to:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
          <li>View and delete cookies</li>
          <li>Block third-party cookies</li>
          <li>Block all cookies (not recommended for this platform)</li>
          <li>Clear cookies when you close your browser</li>
        </ul>
      </section>

      <section>
        <h3 className="text-xl font-semibold text-white mb-3">6. Do Not Track</h3>
        <p>
          We respect Do Not Track (DNT) browser signals. When DNT is enabled, we limit data collection 
          to what is strictly necessary for platform functionality.
        </p>
      </section>
    </div>
  );
}
